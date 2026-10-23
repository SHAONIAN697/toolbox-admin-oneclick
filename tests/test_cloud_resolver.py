import importlib.util
import json
import tempfile
import unittest
import urllib.request
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, Mock, patch
from pathlib import Path


ROOT = Path(__file__).parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"
SPEC = importlib.util.spec_from_file_location("toolbox_cloud_resolver_app", APP_PATH)
APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APP)
RESOLVER_SPEC = importlib.util.spec_from_file_location("toolbox_cloud_resolver_module", APP_PATH.parent / "cloud_resolver.py")
RESOLVER = importlib.util.module_from_spec(RESOLVER_SPEC)
RESOLVER_SPEC.loader.exec_module(RESOLVER)
APP.cloud_resolver = RESOLVER


class FakeHandler:
    def __init__(self, body=None):
        self.body = body or {}
        self.responses = []
        self.client_address = ("127.0.0.1", 12345)
        self.headers = {}

    def read_body(self):
        return self.body

    def base_url(self):
        return "http://127.0.0.1:5088"

    def send_json(self, value, status=200):
        self.responses.append((status, value))
        return value


class InlineExecutor:
    def submit(self, function, *args):
        return function(*args)


class CloudResolverTests(unittest.TestCase):
    def test_order_dates_parse_without_native_fromisoformat(self):
        class LegacyDateTime:
            now = staticmethod(datetime.now)
            strptime = staticmethod(datetime.strptime)

        original_app_datetime = APP.datetime
        original_resolver_datetime = RESOLVER.datetime
        APP.datetime = LegacyDateTime
        RESOLVER.datetime = LegacyDateTime
        try:
            order = APP.public_order({
                "id": "order_legacy_time", "userId": "user_1", "status": "pending",
                "action": "cloud_resolver_plan_purchase",
                "createdAt": "2026-10-22T10:00:00+00:00",
            })
            expiry = RESOLVER._parse_time("2026-10-22T10:30:00+00:00")
            self.assertTrue(order["pendingExpiresAt"].startswith("2026-10-22T10:30:00"))
            self.assertEqual(expiry.tzinfo, timezone.utc)
        finally:
            APP.datetime = original_app_datetime
            RESOLVER.datetime = original_resolver_datetime

    def test_public_order_calculates_remaining_time_from_saved_deadline(self):
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=20)
        order = APP.public_order({
            "id": "order_active_time", "userId": "alice", "status": "pending",
            "action": "cloud_resolver_plan_purchase", "createdAt": datetime.now(timezone.utc).isoformat(),
            "pendingExpiresAt": expires_at.isoformat(),
        })
        self.assertGreater(order["remainingSeconds"], 1100)
        self.assertLessEqual(order["remainingSeconds"], 1200)
        self.assertFalse(order["isExpired"])
        self.assertEqual(order["status"], "pending")

    def test_cloud_order_expiry_uses_system_management_setting(self):
        created_at = datetime.now(timezone.utc)
        with patch.object(APP, "read_system_settings", return_value={"cloudResolverOrderExpiryMinutes": 45}):
            expiry = RESOLVER._order_expiry(APP, {"createdAt": created_at.isoformat()})
        self.assertEqual(int((expiry - created_at).total_seconds()), 45 * 60)

    def test_backend_reports_missing_resolver_module_instead_of_unknown_route(self):
        source = APP_PATH.read_text(encoding="utf-8")
        self.assertIn('cloud_resolver_path and not cloud_resolver', source)
        self.assertIn('服务端网盘解析模块未部署或加载失败', source)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_parse_executor = RESOLVER.PARSE_EXECUTOR
        RESOLVER.PARSE_EXECUTOR = InlineExecutor()
        RESOLVER.ACTIVE_PARSE_TASKS.clear()
        data = Path(self.temp.name)
        APP.DATA = data
        APP.USERS_PATH = data / "users.json"
        APP.USER_TEMPLATE_PATH = data / "user-template.json"
        APP.USER_DATA = data / "users"
        APP.CLOUD_RESOLVER_PATH = data / "cloud-resolver.json"
        APP.AUDIT_LOG_PATH = data / "audit.jsonl"
        APP.SESSIONS.clear()
        APP.CLOUD_RESOLVER_MOCK_ENABLED = True
        users = {
            "users": [
                {"id": "admin", "username": "admin", "role": "super", "active": True},
                {"id": "alice", "username": "alice", "role": "user", "active": True},
                {"id": "bob", "username": "bob", "role": "user", "active": True},
                {"id": "agent", "username": "agent", "role": "agent", "active": True},
            ],
            "inviteCodes": [],
            "settings": {},
        }
        APP.write_json(APP.USERS_PATH, users)
        self.qaiu_key = "test-qaiu-api-key"
        resolver_store = RESOLVER.defaults()
        resolver_store["qaiuApiKeyEncrypted"] = RESOLVER._protect(APP, self.qaiu_key)
        RESOLVER._save(APP, resolver_store)

    def tearDown(self):
        RESOLVER.PARSE_EXECUTOR = self.original_parse_executor
        APP.CLOUD_RESOLVER_MOCK_ENABLED = False
        self.temp.cleanup()

    def auth(self, user_id):
        return {"user": next(x for x in APP.read_users()["users"] if x["id"] == user_id)}

    def call(self, user_id, path, method, body=None):
        handler = FakeHandler(body)
        result = RESOLVER.route(handler, APP, path, method, self.auth(user_id))
        return handler.responses[-1] if handler.responses else (200, result)

    def grant(self, user_id, providers=None):
        status, payload = self.call("admin", f"/api/admin/cloud-resolver/users/{user_id}/grant", "POST", {
            "durationDays": 30, "parseQuota": 5, "dailyParseLimit": 5,
            "allowedProviders": providers or ["mock"],
        })
        self.assertEqual(status, 201)
        return payload

    def parse(self, user_id, name="tool.exe", access_code="secret"):
        status, payload = self.call("alice", "/api/cloud-resolver/parse", "POST", {
            "url": "mock://fixture/share-1", "provider": "mock", "accessCode": access_code,
            "mockFiles": [{"name": name, "path": "/" + name, "size": 12}],
        })
        self.assertEqual(status, 201)
        return payload["tasks"][0]

    def test_entitlement_and_mock_parse_are_owner_scoped_and_redacted(self):
        self.grant("alice")
        task = self.parse("alice")
        self.assertEqual(task["status"], "parsed")
        self.assertNotIn("accessCode", json.dumps(task))
        status, tasks = self.call("alice", "/api/cloud-resolver/parse-tasks", "GET")
        self.assertEqual(status, 200)
        self.assertEqual(len(tasks["tasks"]), 1)
        with self.assertRaises(PermissionError):
            self.call("bob", f"/api/cloud-resolver/parse-tasks/{task['id']}", "GET")

    def test_provider_recognition_and_tianyi_uses_aggregate_parser(self):
        self.assertEqual(RESOLVER._provider_for("https://cloud.189.cn/t/6VvEryMnyYZz")[0], "tianyi")
        self.assertEqual(RESOLVER._provider_for("https://www.lanzout.com/b00uzq6ra")[0], "lanzou")
        self.grant("alice", ["tianyi"])
        def qaiu_reply(path, params=None, api_key="", require_api_key=True):
            if path == "/v2/linkInfo":
                self.assertEqual(api_key, "")
                return {"data": {"shareLinkInfo": {"panName": "天翼云盘", "type": "tianyi"}}}
            if path == "/v2/getFileList":
                self.assertEqual(api_key, self.qaiu_key)
                return {"data": [{"fileId": "f1", "fileName": "demo.zip", "size": 10,
                                  "fileType": "file", "parserUrl": "https://download.example/demo.zip"}]}
            self.fail(f"Unexpected aggregate API path: {path}")

        with patch.object(RESOLVER, "_qaiu_request", side_effect=qaiu_reply) as parser:
            status, payload = self.call("alice", "/api/cloud-resolver/parse", "POST", {
                "url": "https://cloud.189.cn/t/6VvEryMnyYZz", "accessCode": "secret",
            })
        self.assertEqual(status, 201)
        self.assertEqual(payload["tasks"][0]["status"], "parsed", payload["tasks"][0])
        self.assertEqual(payload["tasks"][0]["files"][0]["resolvedUrl"], "https://download.example/demo.zip")
        saved_task = RESOLVER._load(APP)["tasks"][0]
        self.assertEqual(saved_task["files"][0]["downloadUrl"], "https://download.example/demo.zip")
        self.assertEqual(saved_task["files"][0]["resolverType"], "qaiu")
        self.assertEqual(parser.call_count, 2)
        self.assertEqual([call.args[0] for call in parser.call_args_list], ["/v2/linkInfo", "/v2/getFileList"])

    def test_parse_endpoint_returns_before_upstream_work_finishes(self):
        self.grant("alice", ["tianyi"])

        class DeferredExecutor:
            def __init__(self):
                self.jobs = []

            def submit(self, function, *args):
                self.jobs.append((function, args))

        executor = DeferredExecutor()
        RESOLVER.PARSE_EXECUTOR = executor
        files = [{"id": "f1", "name": "demo.zip", "path": "/demo.zip", "size": 10,
                  "type": "file", "downloadUrl": "https://download.example/demo.zip"}]
        with patch.object(RESOLVER, "_provider_parse", return_value=files) as parser:
            status, payload = self.call("alice", "/api/cloud-resolver/parse", "POST", {
                "url": "https://cloud.189.cn/t/6VvEryMnyYZz", "accessCode": "secret",
            })
            self.assertEqual(status, 201)
            task = payload["tasks"][0]
            self.assertEqual(task["status"], "processing")
            parser.assert_not_called()
            self.assertEqual(len(executor.jobs), 1)

            function, args = executor.jobs.pop()
            function(*args)
            parser.assert_called_once()

        status, payload = self.call("alice", f"/api/cloud-resolver/parse-tasks/{task['id']}", "GET")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "parsed")
        self.assertEqual(payload["files"][0]["resolvedUrl"], "https://download.example/demo.zip")

    def test_parse_task_list_resumes_orphaned_processing_jobs(self):
        self.grant("alice", ["tianyi"])

        class DeferredExecutor:
            def __init__(self):
                self.jobs = []

            def submit(self, function, *args):
                self.jobs.append((function, args))

        task = {"id": "orphaned-task", "ownerUserId": "alice", "provider": "tianyi",
                "shareUrl": "https://cloud.189.cn/t/6VvEryMnyYZz", "status": "processing", "files": []}
        store = RESOLVER._load(APP)
        store["tasks"].append(task)
        RESOLVER._save(APP, store)
        executor = DeferredExecutor()
        RESOLVER.PARSE_EXECUTOR = executor
        RESOLVER.ACTIVE_PARSE_TASKS.clear()

        status, payload = self.call("alice", "/api/cloud-resolver/parse-tasks", "GET")

        self.assertEqual(status, 200)
        self.assertEqual(payload["tasks"][0]["status"], "processing")
        self.assertEqual(len(executor.jobs), 1)
        self.assertIn(task["id"], RESOLVER.ACTIVE_PARSE_TASKS)

    def test_qaiu_xiaofeiji_parser_uses_code_query_as_password(self):
        calls = []

        def qaiu_reply(path, params=None, api_key="", require_api_key=True):
            calls.append((path, params or {}))
            if path == "/v2/linkInfo":
                return {"data": {"shareLinkInfo": {"panName": "小飞机网盘"}}}
            if path == "/json/parser":
                return {"data": {"directLink": "https://download.example/file.exe",
                                  "fileInfo": {"fileName": "file.exe", "size": 42}}}
            self.fail(f"Unexpected aggregate API path: {path}")

        with patch.object(RESOLVER, "_qaiu_folder_files", return_value=[]), \
                patch.object(RESOLVER, "_qaiu_request", side_effect=qaiu_reply):
            files = RESOLVER._qaiu_parse(
                "https://share.feijipan.com/s/GNwKM9Qs?code=abat",
                api_key=self.qaiu_key,
                provider="xiaofeiji",
            )
        self.assertEqual(files[0]["name"], "file.exe")
        self.assertEqual(calls[0][1]["pwd"], "abat")
        self.assertEqual(calls[1][1]["pwd"], "abat")

    def test_xiaofeiji_falls_back_to_official_listing_when_aggregate_is_unavailable(self):
        official_files = [{"id": "f1", "name": "demo.exe", "type": "file", "downloadUrl": ""}]
        with patch.object(RESOLVER, "_qaiu_parse", side_effect=RESOLVER.ProviderError("QAIU_PARSE_FAILED")), \
                patch.object(RESOLVER, "_feiji_parse", return_value=official_files) as official:
            result = RESOLVER._provider_parse("xiaofeiji", "https://share.feijipan.com/s/demo?code=abat", "", self.qaiu_key)
        self.assertEqual(result, official_files)
        official.assert_called_once_with("https://share.feijipan.com/s/demo?code=abat", "")

    def test_xiaofeiji_metadata_without_direct_url_is_not_assignable(self):
        self.grant("alice", ["xiaofeiji"])
        with patch.object(RESOLVER, "_provider_parse", return_value=[{
            "id": "file-feiji", "name": "video.exe", "path": "/video.exe", "size": 10,
            "type": "file", "downloadUrl": "", "browserUrl": "https://share.feijipan.com/s/demo",
        }]):
            status, payload = self.call("alice", "/api/cloud-resolver/parse", "POST", {
                "url": "https://share.feijipan.com/s/demo", "provider": "xiaofeiji",
            })
        self.assertEqual(status, 201)
        task = payload["tasks"][0]
        self.assertEqual(task["status"], "failed")
        self.assertEqual(task["errorCode"], "DOWNLOAD_URL_UNAVAILABLE")
        body = {"taskId": task["id"], "fileIds": ["file-feiji"], "scopeType": "page", "scopeId": "p1", "sectionIndex": 0}
        status, result = self.call("alice", "/api/cloud-resolver/assign/preview", "POST", body)
        self.assertEqual(status, 409)
        self.assertEqual(result["error"], "DOWNLOAD_URL_UNAVAILABLE")

    def test_xiaofeiji_retry_keeps_task_failed_without_direct_url(self):
        self.grant("alice", ["xiaofeiji"])
        task = {"id": "feiji-retry", "ownerUserId": "alice", "provider": "xiaofeiji",
                "shareUrl": "https://share.feijipan.com/s/demo", "status": "failed", "files": []}
        store = RESOLVER._load(APP)
        store["tasks"].append(task)
        RESOLVER._save(APP, store)
        with patch.object(RESOLVER, "_provider_parse", return_value=[{"id": "f1", "type": "file", "downloadUrl": ""}]):
            status, result = self.call("alice", f"/api/cloud-resolver/parse-tasks/{task['id']}/retry", "POST")
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["errorCode"], "DOWNLOAD_URL_UNAVAILABLE")

    def test_xiaofeiji_redirect_matches_share_page_download_mode(self):
        opener = Mock()
        response = Mock()
        response.headers.get.return_value = "application/octet-stream"
        response.geturl.return_value = "https://download.example/file.exe"
        opener.open.return_value = MagicMock()
        opener.open.return_value.__enter__.return_value = response
        result = RESOLVER._feiji_file_redirect(
            opener, "GNwKM9Qs", "45494044021", "https://share.feijipan.com/s/GNwKM9Qs",
        )
        self.assertEqual(result, "https://download.example/file.exe")
        request = opener.open.call_args.args[0]
        query = RESOLVER.urllib.parse.parse_qs(RESOLVER.urlparse(request.full_url).query)
        self.assertEqual(query["enable"], ["1"])
        self.assertEqual(query["shareId"], ["GNwKM9Qs"])

    def test_unsupported_share_uses_aggregate_error_without_legacy_fallback(self):
        self.grant("alice", ["xiaofeiji"])
        with patch.object(RESOLVER, "_qaiu_parse", side_effect=RESOLVER.ProviderError("QAIU_LINK_UNSUPPORTED")) as parser, \
             patch.object(RESOLVER, "_feiji_parse") as legacy_parser:
            status, payload = self.call("alice", "/api/cloud-resolver/parse", "POST", {
                "url": "https://share.feijipan.com/s/GNwKM9Qs",
            })
        self.assertEqual(status, 201)
        task = payload["tasks"][0]
        self.assertEqual(task["errorCode"], "QAIU_LINK_UNSUPPORTED")
        self.assertEqual(task["status"], "failed")
        parser.assert_called_once()
        legacy_parser.assert_not_called()

    def test_feiji_retry_reuses_encrypted_access_code(self):
        self.grant("alice", ["xiaofeiji"])
        store = RESOLVER._load(APP)
        store["tasks"].append({
            "id": "protected-retry", "ownerUserId": "alice", "provider": "xiaofeiji",
            "shareUrl": "https://share.feijipan.com/s/zowKQTyT", "status": "failed",
            "accessCodeEncrypted": RESOLVER._protect(APP, "a1vs"), "files": [],
        })
        RESOLVER._save(APP, store)
        with patch.object(RESOLVER, "_provider_parse", return_value=[{
            "id": "f1", "type": "file", "downloadUrl": "https://cdn.example/file.exe",
        }]) as parser:
            status, task = self.call("alice", "/api/cloud-resolver/parse-tasks/protected-retry/retry", "POST")
        self.assertEqual(status, 200)
        self.assertEqual(task["status"], "parsed")
        parser.assert_called_once_with("xiaofeiji", "https://share.feijipan.com/s/zowKQTyT", "a1vs", self.qaiu_key)

    def test_same_name_reuses_button_and_repeated_assignment_is_duplicate(self):
        self.grant("alice")
        existing = APP.new_button({"name": "tool.exe", "action": "link", "url": "https://old.example/tool.exe"})
        APP.write_config({"pages": {"p1": {"title": "个人页", "sections": [{"title": "下载", "buttons": [existing]}]}}, "toolbox_tabs": []}, "alice")
        task = self.parse("alice")
        request = {"taskId": task["id"], "fileIds": [task["files"][0]["id"]], "scopeType": "page", "scopeId": "p1", "sectionIndex": 0}
        status, preview = self.call("alice", "/api/cloud-resolver/assign/preview", "POST", request)
        self.assertEqual(status, 200)
        self.assertEqual(preview["preview"][0]["action"], "reuse")
        status, result = self.call("alice", "/api/cloud-resolver/assign/commit", "POST", request)
        self.assertEqual(status, 200)
        self.assertEqual(result["results"][0]["status"], "added_backup_source")
        # Repair configurations written by an earlier version that registered
        # the source but did not persist it into the editable button fields.
        config = APP.read_config("alice")
        config["pages"]["p1"]["sections"][0]["buttons"][0].pop("backup_urls", None)
        config["pages"]["p1"]["sections"][0]["buttons"][0].pop("backup_url", None)
        APP.write_config(config, "alice")
        status, second = self.call("alice", "/api/cloud-resolver/assign/commit", "POST", request)
        self.assertEqual(second["results"][0]["status"], "duplicate")
        store = RESOLVER._load(APP)
        self.assertEqual(len(store["resources"]), 1)
        self.assertEqual(len(store["sources"]), 1)
        config = APP.read_config("alice")
        self.assertEqual(config["pages"]["p1"]["sections"][0]["buttons"][0]["id"], existing["id"])
        self.assertEqual(config["pages"]["p1"]["sections"][0]["buttons"][0]["backup_urls"], ["mock://fixture/share-1"])

    def test_selected_existing_button_accepts_differently_named_parse_result_as_backup(self):
        self.grant("alice")
        existing = APP.new_button({"name": "我的下载入口", "action": "download", "target": "https://old.example/main.exe"})
        APP.write_config({"pages": {"p1": {"title": "个人页", "sections": [{"title": "下载", "buttons": [existing]}]}}, "toolbox_tabs": []}, "alice")
        task = self.parse("alice", name="new-mirror.exe")
        request = {"taskId": task["id"], "fileIds": [task["files"][0]["id"]], "scopeType": "page", "scopeId": "p1", "sectionIndex": 0, "buttonTargets": {task["files"][0]["id"]: existing["id"]}}
        status, preview = self.call("alice", "/api/cloud-resolver/assign/preview", "POST", request)
        self.assertEqual(status, 200)
        self.assertEqual(preview["preview"][0]["action"], "reuse")
        status, result = self.call("alice", "/api/cloud-resolver/assign/commit", "POST", request)
        self.assertEqual(status, 200)
        self.assertEqual(result["results"][0]["status"], "added_backup_source")
        saved = APP.read_config("alice")["pages"]["p1"]["sections"][0]["buttons"]
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["id"], existing["id"])
        self.assertEqual(saved[0]["backup_urls"], ["mock://fixture/share-1"])

    def test_missing_existing_button_target_never_silently_creates_button(self):
        self.grant("alice")
        existing = APP.new_button({"name": "chag", "action": "download", "target": "https://old.example/chag.exe"})
        APP.write_config({"pages": {"p1": {"title": "个人页", "sections": [{"title": "下载", "buttons": [existing]}]}}, "toolbox_tabs": []}, "alice")
        task = self.parse("alice", name="7.27g调音师插件包.exe")
        request = {"taskId": task["id"], "fileIds": [task["files"][0]["id"]], "scopeType": "page", "scopeId": "p1", "sectionIndex": 0}
        status, preview = self.call("alice", "/api/cloud-resolver/assign/preview", "POST", request)
        self.assertEqual(status, 200)
        self.assertEqual(preview["preview"][0]["action"], "target_required")
        status, result = self.call("alice", "/api/cloud-resolver/assign/commit", "POST", request)
        self.assertEqual(status, 200)
        self.assertEqual(result["results"][0]["status"], "target_required")
        buttons = APP.read_config("alice")["pages"]["p1"]["sections"][0]["buttons"]
        self.assertEqual([button["id"] for button in buttons], [existing["id"]])

    def test_owner_can_delete_parse_record_and_admin_audit_endpoint_is_filtered(self):
        self.grant("alice")
        task = self.parse("alice")
        status, payload = self.call("alice", f"/api/cloud-resolver/parse-tasks/{task['id']}", "DELETE")
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(RESOLVER._load(APP)["tasks"], [])
        status, logs = self.call("admin", "/api/admin/cloud-resolver/audit-logs", "GET")
        self.assertEqual(status, 200)
        self.assertTrue(all(str(row.get("action", "")).startswith("cloud_resolver_") for row in logs["items"]))

    def test_agent_inventory_does_not_grant_use_and_sold_code_is_redeemed_by_member(self):
        with self.assertRaises(PermissionError):
            self.call("agent", "/api/cloud-resolver/parse", "POST", {"url": "mock://fixture/x", "provider": "mock"})
        status, plan = self.call("admin", "/api/admin/cloud-resolver/plans", "POST", {"name": "基础", "durationDays": 7, "allowedProviders": ["mock"]})
        self.assertEqual(status, 201)
        status, generated = self.call("admin", "/api/admin/cloud-resolver/codes", "POST", {"planId": plan["id"], "count": 1, "assignedAgentId": "agent"})
        self.assertEqual(status, 201)
        code = generated["codes"][0]
        self.assertIn(code, [row.get("code") for row in RESOLVER._load(APP)["codes"]])
        status, admin_codes = self.call("admin", "/api/admin/cloud-resolver/codes", "GET")
        self.assertEqual(status, 200)
        self.assertEqual(admin_codes["codes"][0]["code"], code)
        status, agent_inventory = self.call("agent", "/api/agent/cloud-resolver/code-inventory", "GET")
        self.assertEqual(status, 200)
        self.assertNotIn("code", agent_inventory["codes"][0])
        APP.read_users()["users"]
        users = APP.read_users()
        for row in users["users"]:
            if row["id"] == "alice":
                row["parentAgentId"] = "agent"
        APP.write_users(users)
        status, _ = self.call("agent", "/api/agent/cloud-resolver/sell-code", "POST", {"code": code, "userId": "alice"})
        self.assertEqual(status, 200)
        status, entitlement = self.call("alice", "/api/cloud-resolver/activate", "POST", {"code": code})
        self.assertEqual(status, 200)
        self.assertEqual(entitlement["entitlement"]["userId"], "alice")

    def test_admin_can_toggle_and_bulk_delete_codes_using_management_ids(self):
        status, plan = self.call("admin", "/api/admin/cloud-resolver/plans", "POST", {"name": "管理测试", "durationDays": 30})
        self.assertEqual(status, 201)
        status, generated = self.call("admin", "/api/admin/cloud-resolver/codes", "POST", {"planId": plan["id"], "count": 2})
        self.assertEqual(status, 201)
        status, listing = self.call("admin", "/api/admin/cloud-resolver/codes", "GET")
        self.assertEqual(status, 200)
        first, second = listing["codes"]
        self.assertEqual(first["id"], first["codeHash"][:16] if "codeHash" in first else RESOLVER._load(APP)["codes"][0]["codeHash"][:16])
        status, disabled = self.call("admin", f"/api/admin/cloud-resolver/codes/{first['id']}/disable", "POST", {})
        self.assertEqual(status, 200)
        self.assertEqual(disabled["status"], "disabled")
        status, enabled = self.call("admin", f"/api/admin/cloud-resolver/codes/{first['id']}/enable", "POST", {})
        self.assertEqual(status, 200)
        self.assertEqual(enabled["status"], "available")
        status, deleted = self.call("admin", "/api/admin/cloud-resolver/codes", "DELETE", {"ids": [first["id"], second["id"]]})
        self.assertEqual(status, 200)
        self.assertEqual(deleted["deleted"], 2)
        self.assertEqual(RESOLVER._load(APP)["codes"], [])

    def test_lanzou_download_redirect_allows_verified_cdn_host(self):
        request = urllib.request.Request("https://developer4.lanrar.com/file/?token")
        redirected = RESOLVER._LanzouDownloadRedirect().redirect_request(
            request, None, 302, "Found", {"Location": "https://zip2.webgetstore.com/file.zip"},
            "https://zip2.webgetstore.com/file.zip",
        )
        self.assertEqual(redirected.full_url, "https://zip2.webgetstore.com/file.zip")
        with self.assertRaises(RESOLVER.ProviderError):
            RESOLVER._LanzouDownloadRedirect().redirect_request(
                request, None, 302, "Found", {"Location": "https://example.com/file.zip"},
                "https://example.com/file.zip",
            )

    def test_tianyi_download_task_returns_browser_fallback_without_empty_proxy(self):
        self.grant("alice", ["tianyi"])
        store = RESOLVER._load(APP)
        store["sources"].append({
            "id": "source-tianyi",
            "ownerUserId": "alice",
            "provider": "tianyi",
            "shareUrl": "https://cloud.189.cn/t/demo123",
            "fileId": "file-1",
            "fileName": "demo.zip",
            "downloadUrl": "",
            "backupUrl": "",
            "enabled": True,
            "status": "draft",
        })
        RESOLVER._save(APP, store)
        status, task = self.call("alice", "/api/cloud-resolver/download-task", "POST", {"sourceId": "source-tianyi"})
        self.assertEqual(status, 201)
        self.assertEqual(task["status"], "browser")
        self.assertTrue(task["browserOnly"])
        self.assertEqual(task["browserUrl"], "https://cloud.189.cn/t/demo123")
        self.assertEqual(task["downloadUrl"], "")
        self.assertEqual(task["errorCode"], "LOGIN_REQUIRED_FOR_DOWNLOAD")

    def test_xiaofeiji_download_task_refreshes_direct_url_through_proxy(self):
        self.grant("alice", ["xiaofeiji"])
        store = RESOLVER._load(APP)
        store["sources"].append({
            "id": "source-feiji",
            "ownerUserId": "alice",
            "provider": "xiaofeiji",
            "shareUrl": "https://share.feijipan.com/s/demo123",
            "shareId": "demo123",
            "fileId": "file-1",
            "fileName": "demo.exe",
            "downloadUrl": "",
            "backupUrl": "",
            "enabled": True,
            "status": "draft",
        })
        RESOLVER._save(APP, store)
        with patch.object(RESOLVER, "_qaiu_parse", return_value=[{
            "id": "file-1", "name": "demo.exe", "path": "/demo.exe", "size": 10,
            "type": "file", "downloadUrl": "https://cdn.feijipan.com/demo.exe", "backupUrl": "",
            "resolverType": "qaiu", "downloadHeaders": {"Referer": "https://share.feijipan.com/"},
        }]):
            status, task = self.call("alice", "/api/cloud-resolver/download-task", "POST", {"sourceId": "source-feiji"})
        self.assertEqual(status, 201)
        self.assertEqual(task["status"], "queued")
        self.assertFalse(task["browserOnly"])
        self.assertIn("/api/cloud-resolver/download-file", task["downloadUrl"])
        self.assertEqual(task["provider"], "xiaofeiji")

    def test_access_code_is_reused_when_refreshing_xiaofeiji_url(self):
        encrypted = RESOLVER._protect(APP, "a1vs")
        self.assertEqual(RESOLVER._unprotect(APP, encrypted), "a1vs")

    def test_weiyun_nested_files_and_login_requirement(self):
        page = 'window.syncData = ' + json.dumps({"shareInfo": {
            "share_key": "8MkU9fNB", "pdir_key": "root", "finish_flag": True,
            "dir_list": [{"dir_key": "folder", "dir_name": "安装包"}], "file_list": []}}) + ';'
        responses = [
            {"file_list": [{"file_id": "file1", "filename": "安装.zip", "file_size": 6003}],
             "dir_list": [{"dir_key": "child", "dir_name": "说明"}], "finish_flag": True},
            {"file_list": [{"file_id": "file2", "filename": "说明.txt", "file_size": 12}],
             "dir_list": [], "finish_flag": True},
            RESOLVER.ProviderError("WEIYUN_LOGIN_REQUIRED"),
        ]
        with patch.object(RESOLVER, "_weiyun_read", return_value=page), patch.object(
            RESOLVER, "_weiyun_request", side_effect=responses
        ) as request:
            files = RESOLVER._weiyun_parse("https://share.weiyun.com/8MkU9fNB", "")
        self.assertEqual([f["path"] for f in files], ["/安装包/安装.zip", "/安装包/说明/说明.txt"])
        self.assertEqual(files[0]["size"], 6003)
        self.assertTrue(all(f["errorCode"] == "WEIYUN_LOGIN_REQUIRED" and not f["downloadUrl"] for f in files))
        self.assertEqual(request.call_count, 3)

    def test_weiyun_request_uses_page_token_and_reports_login_error(self):
        from types import SimpleNamespace
        jar = [SimpleNamespace(name="wyctoken", value="123456")]
        response = {"ret": -3000, "msg": "无登录态，请重新登录"}
        with patch.object(RESOLVER, "_weiyun_read", return_value=json.dumps(response)) as read:
            with self.assertRaisesRegex(RESOLVER.ProviderError, "WEIYUN_LOGIN_REQUIRED"):
                RESOLVER._weiyun_request(None, jar, "WeiyunShareBatchDownload", 12024, {}, "https://share.weiyun.com/test")
        self.assertIn("g_tk=123456", read.call_args.args[1])
        self.assertIn("/weiyunShare/", read.call_args.args[1])

    def test_weiyun_password_required_and_invalid(self):
        page = 'window.syncData = {"shareInfo":{"need_pwd":true}};'
        with patch.object(RESOLVER, "_weiyun_read", return_value=page):
            with self.assertRaisesRegex(RESOLVER.ProviderError, "ACCESS_CODE_REQUIRED"):
                RESOLVER._weiyun_parse("https://share.weiyun.com/8MkU9fNB")
        response = {"data": {"rsp_header": {"retcode": 1, "retmsg": "访问密码错误"}}}
        with patch.object(RESOLVER, "_weiyun_read", return_value=json.dumps(response)):
            with self.assertRaisesRegex(RESOLVER.ProviderError, "ACCESS_CODE_INVALID"):
                RESOLVER._weiyun_request(None, [], "WeiyunShareView", 12002, {}, "")

    def test_weiyun_aggregate_parse_retry_and_download_proxy(self):
        self.grant("alice", ["weiyun"])
        file = {"id": "weiyun-file", "name": "安装.zip", "path": "/安装.zip", "size": 10,
                "type": "file", "downloadUrl": "https://download.example/install.zip", "resolverType": "qaiu"}
        with patch.object(RESOLVER, "_qaiu_parse", return_value=[file]) as parser:
            status, payload = self.call("alice", "/api/cloud-resolver/parse", "POST", {
                "url": "https://share.weiyun.com/8MkU9fNB", "accessCode": "abcd"})
            task = payload["tasks"][0]
            self.assertEqual(status, 201)
            self.assertEqual(task["status"], "parsed")
            self.assertEqual(task["errorCode"], "")
            self.call("alice", f"/api/cloud-resolver/parse-tasks/{task['id']}/retry", "POST")
            parser.assert_called_with("https://share.weiyun.com/8MkU9fNB", "abcd", self.qaiu_key, "weiyun")
        APP.write_config({"pages": {"p1": {"sections": [{"buttons": []}]}}}, "alice")
        status, result = self.call("alice", "/api/cloud-resolver/assign/commit", "POST", {
            "taskId": task["id"], "fileIds": [file["id"]], "scopeType": "page", "scopeId": "p1", "sectionIndex": 0})
        self.assertEqual(status, 200)
        source = RESOLVER._load(APP)["sources"][0]
        self.assertEqual(source["resolverType"], "qaiu")
        status, download = self.call("alice", "/api/cloud-resolver/download-task", "POST", {"sourceId": source["id"]})
        self.assertEqual(status, 201)
        self.assertEqual(download["status"], "queued")
        self.assertFalse(download["browserOnly"])
        self.assertIn("/api/cloud-resolver/download-file", download["downloadUrl"])
        self.assertEqual(download["upstreamUrl"], "")

    def test_qaiu_key_is_encrypted_and_never_returned_to_admin_api(self):
        new_key = "replacement-unit-test-key"
        status, payload = self.call("admin", "/api/admin/cloud-resolver/settings", "PATCH", {"qaiuApiKey": new_key})
        self.assertEqual(status, 200)
        self.assertTrue(payload["qaiuApiKeySet"])
        self.assertNotIn(new_key, json.dumps(payload))
        store = RESOLVER._load(APP)
        self.assertNotEqual(store["qaiuApiKeyEncrypted"], new_key)
        self.assertEqual(RESOLVER._qaiu_api_key(APP, store), new_key)
        status, settings = self.call("admin", "/api/admin/cloud-resolver/settings", "GET")
        self.assertEqual(status, 200)
        self.assertEqual(settings["qaiuApiBase"], "https://pan.vst76.cn")
        self.assertNotIn(new_key, json.dumps(settings))
        status, denied = self.call("alice", "/api/admin/cloud-resolver/settings", "PATCH", {"qaiuApiKey": "not-allowed"})
        self.assertEqual(status, 403)
        self.assertNotIn("not-allowed", json.dumps(denied))

    def test_qaiu_api_base_is_admin_configurable_and_rejects_plaintext_remote_hosts(self):
        local_base = "http://127.0.0.1:6430"
        status, payload = self.call("admin", "/api/admin/cloud-resolver/settings", "PATCH", {
            "qaiuApiBase": local_base,
        })
        self.assertEqual(status, 200)
        self.assertEqual(payload["qaiuApiBase"], local_base)
        self.assertEqual(RESOLVER._load(APP)["qaiuApiBase"], local_base)

        status, denied = self.call("alice", "/api/admin/cloud-resolver/settings", "PATCH", {
            "qaiuApiBase": "http://127.0.0.1:6431",
        })
        self.assertEqual(status, 403)
        self.assertNotIn("6431", json.dumps(denied))

        status, invalid = self.call("admin", "/api/admin/cloud-resolver/settings", "PATCH", {
            "qaiuApiBase": "http://pan.vst76.cn",
        })
        self.assertEqual(status, 400)
        self.assertEqual(RESOLVER._load(APP)["qaiuApiBase"], local_base)

    def test_qaiu_parser_uses_configured_local_api_base_for_all_requests(self):
        local_base = "http://127.0.0.1:6430"
        calls = []

        def qaiu_reply(path, params=None, api_key="", require_api_key=True, api_base=None):
            calls.append((path, api_base))
            if path == "/v2/linkInfo":
                return {"data": {"shareLinkInfo": {"panName": "测试网盘"}}}
            if path == "/json/parser":
                return {"data": {"directLink": "https://download.example/file.exe",
                                  "fileInfo": {"fileName": "file.exe", "size": 42}}}
            self.fail(f"Unexpected aggregate API path: {path}")

        with patch.object(RESOLVER, "_qaiu_folder_files", return_value=[]), \
                patch.object(RESOLVER, "_qaiu_request", side_effect=qaiu_reply):
            files = RESOLVER._qaiu_parse("https://share.example/file", api_key=self.qaiu_key,
                                         provider="qaiu", api_base=local_base)
        self.assertEqual(files[0]["name"], "file.exe")
        self.assertEqual(calls, [("/v2/linkInfo", local_base), ("/json/parser", local_base)])

    def test_unlimited_global_daily_default_is_inherited_by_new_plans(self):
        status, settings = self.call("admin", "/api/admin/cloud-resolver/settings", "PATCH", {
            "settings": {"dailyParseLimit": -1},
        })
        self.assertEqual(status, 200)
        status, plan = self.call("admin", "/api/admin/cloud-resolver/plans", "POST", {
            "name": "不限量套餐", "parseQuota": -1,
        })
        self.assertEqual(status, 201)
        self.assertEqual(plan["parseQuota"], -1)
        self.assertEqual(plan["dailyParseLimit"], -1)

    def test_qaiu_request_sends_api_key_header_and_rejects_non_json(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.getcode.return_value = 200
        response.read.return_value = b'{"code":200,"data":{}}'
        with patch.object(RESOLVER.urllib.request, "urlopen", return_value=response) as urlopen:
            payload = RESOLVER._qaiu_request("/v2/linkInfo", {"url": "https://share.example/x"}, self.qaiu_key)
        self.assertEqual(payload["code"], 200)
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://pan.vst76.cn/v2/linkInfo?url=https%3A%2F%2Fshare.example%2Fx")
        self.assertEqual(request.get_header("X-api-key"), self.qaiu_key)
        with patch.object(RESOLVER.urllib.request, "urlopen", return_value=response) as local_urlopen:
            RESOLVER._qaiu_request("/json/parser", {}, self.qaiu_key,
                                   api_base="http://127.0.0.1:6430")
        self.assertEqual(local_urlopen.call_args.args[0].full_url, "http://127.0.0.1:6430/json/parser")
        response.read.return_value = b"not-json"
        with patch.object(RESOLVER.urllib.request, "urlopen", return_value=response):
            with self.assertRaisesRegex(RESOLVER.ProviderError, "PROVIDER_BAD_RESPONSE"):
                RESOLVER._qaiu_request("/v2/linkInfo", {}, self.qaiu_key)

    def test_qaiu_directory_parse_recurses_and_keeps_safe_download_metadata(self):
        replies = {
            "https://share.example/root": {"data": [{
                "fileName": "安装包", "fileId": "dir-1", "fileType": "folder",
                "parserUrl": "https://share.example/folder-1",
            }]},
            "https://share.example/folder-1": {"data": [{
                "fileName": "setup.exe", "fileId": "file-1", "fileType": "exe",
                "size": "1234", "parserUrl": "https://pan.vst76.cn/v2/redirectUrl/x/file-1",
            }]},
        }
        with patch.object(RESOLVER, "_qaiu_request", side_effect=lambda path, params=None, api_key="", require_api_key=True: replies[params["url"]]) as request:
            files = RESOLVER._qaiu_folder_files("https://share.example/root", "", self.qaiu_key,
                                                 "其他网盘", {"Referer": "https://share.example/"})
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["path"], "/安装包/setup.exe")
        self.assertEqual(files[0]["size"], 1234)
        self.assertEqual(files[0]["downloadUrl"], "https://pan.vst76.cn/v2/redirectUrl/x/file-1")
        self.assertEqual(files[0]["downloadHeaders"], {"Referer": "https://share.example/"})
        self.assertEqual(request.call_count, 2)

    def test_xiaofeiji_unavailable_source_returns_permanent_download_error(self):
        self.grant("alice", ["xiaofeiji"])
        store = RESOLVER._load(APP)
        store["sources"].append({
            "id": "source-feiji-dead", "ownerUserId": "alice", "provider": "xiaofeiji",
            "shareUrl": "https://share.feijipan.com/s/demo123", "fileId": "file-1",
            "downloadUrl": "", "backupUrl": "", "enabled": True, "status": "draft",
        })
        RESOLVER._save(APP, store)
        with patch.object(RESOLVER, "_feiji_parse", return_value=[{"id": "file-1", "downloadUrl": ""}]):
            status, payload = self.call("alice", "/api/cloud-resolver/download-task", "POST", {"sourceId": "source-feiji-dead"})
        self.assertEqual(status, 201)
        self.assertEqual(payload["status"], "failed")


if __name__ == "__main__":
    unittest.main()
