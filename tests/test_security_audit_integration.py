import importlib.util
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1] / "src" / "ToolboxAdminApi-oneclick"
SPEC = importlib.util.spec_from_file_location("toolbox_audit_integration", ROOT / "app.py")
APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APP)

PASSWORD = "test-local-fixture-password"
INVITE = "CHECK-123456-TEST"


class SecurityAuditIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        paths = {key: root / "data" / value.name for key, value in vars(APP).items()
                 if isinstance(value, Path) and value.parent == APP.ROOT / "data"}
        paths.update(DATA=root / "data", ADMIN_TOKEN=PASSWORD, SESSIONS={}, LOGIN_MAX_FAILURES=5)
        self.addCleanup(patch.stopall)
        patch.multiple(APP, **paths).start()
        patch.object(APP, "locate_ip", return_value="").start()
        patch.dict(os.environ, {"TOOLBOX_PUBLIC_URL": "", "TOOLBOX_AUDIT_SIGNING_KEY": "test-key-only"}).start()
        APP.read_users()
        store = APP.read_users()
        store["inviteCodes"].append({"code": INVITE, "active": True, "usedCount": 0, "maxUses": 1,
                                      "createdAt": APP.now_iso(), "createdById": "admin"})
        APP.write_users(store)
        APP.migrate_audit()
        self.server = APP.ThreadingHTTPServer(("127.0.0.1", 0), APP.Handler)
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(self, path, method="GET", body=None, token=None, **headers):
        if token:
            headers["Authorization"] = "Bearer " + token
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, method=method, headers=headers,
                                         data=None if body is None else json.dumps(body).encode())
        try:
            response = urllib.request.urlopen(request, timeout=20)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            data = response.read()
            return response.status, json.loads(data) if "json" in response.headers.get("content-type", "") else data

    def login(self):
        status, value = self.request("/api/login", "POST", {"username": APP.ADMIN_USERNAME, "password": PASSWORD})
        self.assertEqual(status, 200, value)
        return value["token"]

    def register(self, username="audit-user"):
        return self.request("/api/register", "POST", {"username": username, "password": PASSWORD,
                            "displayName": "注册名 A", "email": username + "@example.net", "inviteCode": INVITE,
                            "phone": "+1 212 555 1234"})

    def rows(self, endpoint, token, **query):
        code, body = self.request(endpoint + "?" + urllib.parse.urlencode(query), token=token)
        self.assertEqual(code, 200, body)
        return body

    def test_register_rename_delete_invite_and_read_chain(self):
        admin = self.login()
        status, account = self.register()
        self.assertEqual(status, 200, account)
        uid = account["user"]["id"]
        self.assertEqual(self.rows("/api/super/users", admin, invite=INVITE)["users"][0]["id"], uid)
        marker = "新名 B <测试>"
        status, result = self.request("/api/admin/account", "PATCH", {"displayName": marker}, account["token"])
        self.assertEqual(status, 200, result)
        for term in ("注册名 A", marker, INVITE):
            row = self.rows("/api/super/users", admin, q=term)["users"][0]
            self.assertEqual((row["id"], row["registeredDisplayName"], row["displayName"]), (uid, "注册名 A", marker))
        self.assertEqual(self.request("/api/super/invites", "DELETE", {"code": INVITE}, admin)[0], 200)
        self.assertEqual(self.rows("/api/super/users", admin, invite=INVITE)["users"][0]["id"], uid)
        identity = self.rows("/api/super/users/identity", admin, id=uid)
        self.assertEqual(identity["registration"]["status"], "deleted")
        self.assertEqual(identity["registration"]["phone"], "+1 212 555 1234")
        change = next(row for row in identity["changes"] if row["field"] == "displayName")
        self.assertEqual((change["before_value"], change["after_value"]), ("注册名 A", marker))
        audit = self.rows("/api/super/audit", admin, invite=INVITE)["items"]
        self.assertTrue({"invite_delete", "register_success", "user_identity_changed"} <= {row["eventType"] for row in audit})
        self.assertNotIn(INVITE, json.dumps(audit))
        self.assertTrue(self.rows("/api/super/audit/integrity", admin)["ok"])

    def test_access_checks_persistent_rate_and_logout(self):
        self.assertEqual(self.request("/api/super/audit")[0], 401)
        admin = self.login()
        self.assertEqual(self.request("/api/super/audit", token=None, Cookie="session=fixture")[0], 401)
        self.assertEqual(self.request("/api/super/invites", "POST", {"count": 1}, admin, Origin="https://different.example")[0], 403)
        self.assertEqual(self.request("/api/super/users/batch", "POST", {"action": "disable", "ids": "admin"}, admin)[0], 400)
        status, account = self.register()
        self.assertEqual(status, 200, account)
        token, uid = account["token"], account["user"]["id"]
        self.assertEqual(self.request("/api/super/audit", token=token)[0], 403)
        self.assertEqual(self.request("/api/admin/config/export", token=token)[0], 403)
        status, changed = self.request("/api/super/users", "PATCH", {"id": uid, "role": "agent", "currentPassword": PASSWORD}, admin)
        self.assertEqual(status, 200, changed)
        self.assertEqual(self.request("/api/super/audit/preview", "POST", {}, token)[0], 403)
        role = self.rows("/api/super/audit", admin, eventType="user_role_changed")["items"][0]
        self.assertEqual((role["before"]["role"], role["after"]["role"]), ("user", "agent"))
        for _ in range(APP.LOGIN_MAX_FAILURES):
            self.assertEqual(self.request("/api/login", "POST", {"username": "lock-sample", "password": "bad"})[0], 401)
        self.assertEqual(self.request("/api/login", "POST", {"username": "lock-sample", "password": "bad"})[0], 429)
        self.assertEqual(self.request("/api/admin/logout", "POST", {}, admin)[0], 200)
        self.assertEqual(self.request("/api/super/audit", token=admin)[0], 401)

    def test_new_login_replaces_previous_session_for_same_account(self):
        first = self.login()
        second = self.login()
        self.assertNotEqual(first, second)
        self.assertEqual(self.request("/api/super/audit", token=first)[0], 401)
        self.assertEqual(self.request("/api/super/audit", token=second)[0], 200)
        rows = self.rows("/api/super/audit", second, eventType="session_replaced")["items"]
        self.assertTrue(rows)

    def test_paging_export_and_cleanup_confirmation(self):
        admin = self.login()
        result = self.request("/api/super/invites", "POST", {"count": 2}, admin)
        self.assertEqual(result[0], 200, result)
        page = self.rows("/api/super/audit", admin, limit=1)
        older = self.rows("/api/super/audit", admin, limit=1, before=page["nextBefore"])
        self.assertLess(older["items"][0]["logId"], page["items"][0]["logId"])
        self.assertFalse(self.rows("/api/super/audit", admin, q="sample%'_literal")["items"])
        self.assertTrue(self.rows("/api/super/audit/export", admin, eventType="invite_create")["items"])
        filters = {"eventType": "invite_create"}
        status, preview = self.request("/api/super/audit/preview", "POST", {"filters": filters}, admin)
        self.assertEqual((status, preview["count"]), (200, 1))
        confirmation = {"filters": filters, "reason": "测试保留策略", "confirmation": preview["confirmation"],
                        "currentPassword": PASSWORD}
        self.assertEqual(self.request("/api/super/audit", "DELETE", confirmation, admin)[0], 200)
        self.assertEqual(self.request("/api/super/audit", "DELETE", confirmation, admin)[0], 409)
        self.assertFalse(self.rows("/api/super/audit", admin, **filters)["items"])
        cleanup = self.rows("/api/super/audit", admin, eventType="audit_log_filtered_cleared")["items"][0]
        self.assertEqual(cleanup["details"]["cleared"], 1)
        self.assertTrue(self.rows("/api/super/audit/integrity", admin)["ok"])

    def test_concurrent_single_use_and_audit_idempotence(self):
        admin = self.login()
        with ThreadPoolExecutor(max_workers=6) as pool:
            completed = list(pool.map(lambda i: self.register(f"parallel-{i}"), range(6)))
        accepted = [result for status, result in completed if status == 200]
        self.assertEqual(len(accepted), 1, completed)
        APP.recover_identity_outbox()
        audit = self.rows("/api/super/audit", admin, invite=INVITE)["items"]
        self.assertEqual(len({row["eventId"] for row in audit}), len(audit))
        registered = [row for row in audit if row["eventType"] == "register_success"]
        self.assertEqual(len(registered), 1)
        self.assertEqual(registered[0]["actorId"], accepted[0]["user"]["id"])

    def test_build_and_download_audit_and_job_scope(self):
        admin = self.login()
        status, user = self.register()
        self.assertEqual(status, 200, user)
        with patch.object(APP, "make_client_exe", return_value=("fixture.exe", b"MZ" + b"\0" * 512)), \
                patch.object(APP, "is_windows_exe", return_value=True):
            status, job = self.request("/api/admin/client/build", "POST", {"variant": "original"}, user["token"])
            self.assertEqual(status, 200, job)
            for thread in threading.enumerate():
                if getattr(thread, "_target", None) and "start_client_build_job" in thread._target.__qualname__:
                    thread.join(10)
            self.assertEqual(self.request("/api/admin/client/build/file?id=" + job["id"], token=user["token"])[0], 200)
            self.assertEqual(self.request("/api/admin/client/build/status?id=" + job["id"], token=user["token"])[0], 200)
            APP.CLIENT_BUILD_JOBS[job["id"]]["userId"] = "different-fixture-user"
            self.assertEqual(self.request("/api/admin/client/build/status?id=" + job["id"], token=user["token"])[0], 404)
            self.assertEqual(self.request("/api/admin/client/build/file?id=" + job["id"], token=user["token"])[0], 404)
        for event in ("client_build_completed", "client_build_download"):
            details = self.rows("/api/super/audit", admin, eventType=event)["items"][0]["details"]
            self.assertEqual(details["count"], 1)
            self.assertTrue(details["version"] and details["variantLabel"])

