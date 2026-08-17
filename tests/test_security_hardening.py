import importlib.util
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path


APP_PATH = Path(__file__).parents[1] / "src" / "ToolboxAdminApi-oneclick" / "app.py"
os.environ.setdefault("TOOLBOX_ADMIN_TOKEN", "test-admin-password")
spec = importlib.util.spec_from_file_location("toolbox_security_app", APP_PATH)
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class FakeHandler:
    def __init__(self, token):
        self.headers = {"Authorization": f"Bearer {token}"}
        self.query = {}
        self.client_address = ("127.0.0.1", 12345)


class SecurityHardeningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        data = Path(self.temp.name)
        app.DATA = data
        app.USERS_PATH = data / "users.json"
        app.SESSIONS_PATH = data / "sessions.json"
        app.USER_DATA = data / "users"
        app.AUDIT_LOG_PATH = data / "security-audit.jsonl"
        app.BACKUP_DIR = data / "security-backups"
        app.SESSIONS.clear()
        app.write_json(app.USERS_PATH, {"users": [{
            "id": "admin", "username": "admin", "role": "super", "active": True,
            "passwordHash": app.stored_password("correct-password"),
        }], "inviteCodes": [], "settings": {}})

    def tearDown(self):
        self.temp.cleanup()

    def test_password_hash_is_slow_and_legacy_hashes_still_verify(self):
        value = app.stored_password("secret-password")
        self.assertTrue(value.startswith("pbkdf2_sha256$310000$"))
        self.assertTrue(app.check_password("secret-password", value))
        self.assertFalse(app.check_password("wrong-password", value))
        salt = "legacy-salt"
        legacy = f"sha256${salt}${app.sha256_hex(salt + 'secret-password')}"
        self.assertTrue(app.check_password("secret-password", legacy))

    def test_admin_environment_token_is_not_an_authentication_bypass(self):
        app.ADMIN_TOKEN = "stolen-bootstrap-token"
        self.assertIsNone(app.get_auth(FakeHandler(app.ADMIN_TOKEN)))

    def test_expired_sessions_are_rejected_and_removed(self):
        app.SESSIONS["expired"] = {"userId": "admin", "createdAt": "2000-01-01T00:00:00+00:00"}
        self.assertIsNone(app.get_auth(FakeHandler("expired")))
        self.assertNotIn("expired", app.SESSIONS)

    def test_iso_session_dates_work_without_datetime_fromisoformat(self):
        class LegacyDateTime:
            now = staticmethod(datetime.now)
            strptime = staticmethod(datetime.strptime)

        original = app.datetime
        app.datetime = LegacyDateTime
        try:
            parsed = app.parse_iso_datetime("2026-08-16T10:20:30.123456+00:00")
            self.assertEqual(parsed.year, 2026)
            self.assertIsNotNone(parsed.tzinfo)
        finally:
            app.datetime = original

    def test_sensitive_account_change_revokes_sessions_and_creates_backup(self):
        app.write_json(app.SESSIONS_PATH, {})
        app.SESSIONS["old-session"] = {"userId": "admin", "createdAt": app.now_iso()}
        app.update_user_account("admin", {"email": "new@example.com"})
        self.assertNotIn("old-session", app.SESSIONS)
        self.assertTrue(any(app.BACKUP_DIR.iterdir()))


if __name__ == "__main__":
    unittest.main()
