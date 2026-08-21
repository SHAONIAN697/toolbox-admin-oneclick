import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AuditUserFieldsTests(unittest.TestCase):
    def test_audit_shows_and_searches_display_name_username_email(self):
        for source_dir in ("ToolboxAdminApi-baota-source", "ToolboxAdminApi-oneclick"):
            script = (ROOT / "src" / source_dir / "wwwroot" / "admin.js").read_text(encoding="utf-8")
            self.assertIn("user.displayName, user.username, user.email", script)
            self.assertIn("item.actorDisplayName || user?.displayName", script)
            self.assertIn("item.actorEmail || user?.email", script)
            self.assertIn("function auditUserLabel(item)", script)
            self.assertIn("${auditUserLabel(item)}", script)
            self.assertIn("用户名：", script)
            self.assertIn("邮箱：", script)


if __name__ == "__main__":
    unittest.main()
