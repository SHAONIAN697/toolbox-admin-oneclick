import importlib.util
import json
import smtplib
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "src" / "ToolboxAdminApi-oneclick"
SPEC = importlib.util.spec_from_file_location("toolbox_announcement_mail_app", PROJECT / "app.py")
APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APP)


class FakeSMTP:
    messages = []
    rejected = set()

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def starttls(self):
        return None

    def login(self, user, password):
        return None

    def send_message(self, message):
        if message["To"] in self.rejected:
            raise smtplib.SMTPRecipientsRefused({message["To"]: (550, b"rejected")})
        self.messages.append(message)


class AnnouncementMailTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        data = Path(self.temp.name)
        self.originals = {name: getattr(APP, name) for name in (
            "DATA", "MAIL_PATH", "USERS_PATH", "ADMIN_ANNOUNCEMENTS_PATH",
            "ADMIN_ANNOUNCEMENT_READS_PATH", "AUDIT_LOG_PATH"
        )}
        APP.DATA = data
        APP.MAIL_PATH = data / "mail.json"
        APP.USERS_PATH = data / "users.json"
        APP.ADMIN_ANNOUNCEMENTS_PATH = data / "announcements.json"
        APP.ADMIN_ANNOUNCEMENT_READS_PATH = data / "reads.json"
        APP.AUDIT_LOG_PATH = data / "audit.jsonl"
        APP.write_json(APP.MAIL_PATH, {"host": "smtp.example", "port": 465, "user": "sender", "password": "secret", "from": "sender@example.com", "secure": True})
        FakeSMTP.messages = []
        FakeSMTP.rejected = set()
        self.announcement = {"id": "a1", "title": "版本更新", "version": "2.0", "type": "功能更新", "summary": "摘要", "content": "更新内容", "publish_time": "2026-09-01T00:00:00+00:00"}

    def call_route(self, body, role="super", announcement=None, users=None, path="/api/admin/announcements/a1/mail"):
        row = dict(self.announcement, status="published", enabled=True)
        if announcement:
            row.update(announcement)
        APP.write_json(APP.ADMIN_ANNOUNCEMENTS_PATH, {"announcements": [row]})
        APP.write_json(APP.ADMIN_ANNOUNCEMENT_READS_PATH, {"reads": []})
        APP.write_json(APP.USERS_PATH, {"users": users or [{"id": "u1", "email": "one@example.com", "active": True}], "inviteCodes": [], "settings": {}})

        class Endpoint:
            headers = {}
            query = {}
            client_address = ("127.0.0.1", 1234)

            def read_body(self):
                return body

            def send_json(self, value, status=200):
                return status, value

        actor = {"id": "admin", "username": "admin", "displayName": "Admin", "role": role, "email": "admin@example.com"}
        return APP.Handler.handle_admin_announcements(Endpoint(), path, "POST", {"user": actor})

    def tearDown(self):
        for name, value in self.originals.items():
            setattr(APP, name, value)
        self.temp.cleanup()

    def test_private_messages_and_partial_failure(self):
        users = [
            {"id": "u1", "email": "one@example.com", "active": True},
            {"id": "u2", "email": "two@example.com", "active": True},
            {"id": "u3", "email": "", "active": True},
            {"id": "u4", "email": "bad", "active": True},
            {"id": "u5", "email": "off@example.com", "active": False},
        ]
        FakeSMTP.rejected = {"two@example.com"}
        with mock.patch.object(APP.smtplib, "SMTP_SSL", FakeSMTP):
            result = APP.send_announcement_mail_to_users(self.announcement, users)
        self.assertEqual((result["selected"], result["sent"], result["failed"]), (5, 1, 4))
        self.assertEqual([message["To"] for message in FakeSMTP.messages], ["one@example.com"])
        self.assertNotIn("two@example.com", str(FakeSMTP.messages[0]))
        body = FakeSMTP.messages[0].get_content()
        for value in ("版本更新", "2.0", "功能更新", "摘要", "更新内容", "2026-09-01"):
            self.assertIn(value, body)
        reasons = {row["userId"]: row["reason"] for row in result["failures"]}
        self.assertEqual(reasons["u2"], "收件人被邮箱服务器拒绝。")
        self.assertEqual(reasons["u3"], "未绑定邮箱")
        self.assertEqual(reasons["u4"], "邮箱地址无效")
        self.assertEqual(reasons["u5"], "账号已停用")

    def test_unconfigured_smtp_is_structured_and_safe(self):
        APP.write_json(APP.MAIL_PATH, APP.default_mail_settings())
        result = APP.send_announcement_mail_to_users(self.announcement, [{"id": "u1", "email": "one@example.com", "active": True}])
        self.assertEqual((result["ok"], result["sent"], result["failed"]), (False, 0, 1))
        self.assertEqual(result["failures"][0]["reason"], "SMTP 未配置完整")
        self.assertNotIn("secret", json.dumps(result, ensure_ascii=False))

    def test_smtp_errors_are_sanitized(self):
        cases = [
            (smtplib.SMTPAuthenticationError(535, b"password=secret"), "登录失败"),
            (TimeoutError("secret host"), "请求超时"),
            (smtplib.SMTPNotSupportedError("secret tls"), "TLS"),
            (smtplib.SMTPSenderRefused(550, b"secret", "sender"), "发件人"),
        ]
        for error, expected in cases:
            reason = APP.smtp_failure_reason(error)
            self.assertIn(expected, reason)
            self.assertNotIn("secret", reason)

    def test_routes_and_frontend_contract_exist_in_both_sources(self):
        sources = [PROJECT, ROOT.parent / "ToolboxAdminApi-baota-source"]
        for base in sources:
            app_source = (base / "app.py").read_text(encoding="utf-8")
            js = (base / "wwwroot" / "admin.js").read_text(encoding="utf-8")
            css = (base / "wwwroot" / "styles.css").read_text(encoding="utf-8")
            self.assertIn('/api/admin/announcements/([^/]+)/mail', app_source)
            self.assertIn("只有超级管理员可以推送更新公告邮件", app_source)
            self.assertIn("该条目是更新公告，请前往更新公告页面推送", app_source)
            self.assertIn("notice.refType === 'announcement'", js)
            self.assertIn("isSuper() && !isAnnouncement", js)
            self.assertIn("switchView('announcements')", js)
            self.assertIn("await openAnnouncementDetail(announcementId)", js)
            self.assertIn("new Set()", js)
            self.assertIn("announcementMailVisibleUsers()", js)
            self.assertIn("overlay._busy || overlay._completed", js)
            self.assertIn("/api/admin/notices/mail", js)
            self.assertIn("/api/admin/announcements/${encodeURIComponent(item.id)}/mail", js)
            self.assertIn(".announcement-mail-users", css)
            self.assertIn("overflow-y: auto", css)

    def test_mail_route_is_excluded_from_generic_audit(self):
        self.assertFalse(APP.should_write_generic_audit("/api/admin/announcements/a1/mail", "POST"))

    def test_route_permission_and_request_validation(self):
        status, payload = self.call_route({"userIds": ["u1"]}, role="user")
        self.assertEqual(status, 403)
        self.assertIn("超级管理员", payload["error"])
        for invalid in (None, "u1", [], {}):
            status, payload = self.call_route({"userIds": invalid})
            self.assertEqual(status, 400)
            self.assertIn("非空数组", payload["error"])
        status, payload = self.call_route({"userIds": ["missing"]})
        self.assertEqual(status, 400)
        self.assertEqual(payload["unknownUserIds"], ["missing"])

    def test_route_rejects_missing_and_unavailable_announcements(self):
        status, payload = self.call_route({"userIds": ["u1"]}, path="/api/admin/announcements/missing/mail")
        self.assertEqual((status, payload["error"]), (404, "公告不存在。"))
        unavailable = [
            {"status": "draft"},
            {"status": "withdrawn"},
            {"enabled": False},
            {"publish_time": "2999-01-01T00:00:00+00:00"},
            {"expire_time": "2000-01-01T00:00:00+00:00"},
        ]
        for changes in unavailable:
            status, payload = self.call_route({"userIds": ["u1"]}, announcement=changes)
            self.assertEqual(status, 400)
            self.assertIn("当前有效", payload["error"])

    def test_route_deduplicates_ids_and_writes_single_audit(self):
        expected = {"ok": True, "selected": 1, "sent": 1, "failed": 0, "message": "成功发送 1 封，失败 0 封", "failures": []}
        with mock.patch.object(APP, "send_announcement_mail_to_users", return_value=expected) as sender:
            status, payload = self.call_route({"userIds": ["u1", "u1"]})
        self.assertEqual((status, payload), (200, expected))
        self.assertEqual(len(sender.call_args.args[1]), 1)
        entries = [json.loads(line) for line in APP.AUDIT_LOG_PATH.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["action"], "announcement_mail")
        self.assertEqual(entries[0]["details"]["selected"], 1)
        self.assertNotIn("password", json.dumps(entries[0], ensure_ascii=False).lower())


if __name__ == "__main__":
    unittest.main()
