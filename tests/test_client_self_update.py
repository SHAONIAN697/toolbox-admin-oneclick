import unittest
from pathlib import Path


CLIENT_SOURCE = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "client-template"
    / "ToolboxClient.cs"
)


class ClientSelfUpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CLIENT_SOURCE.read_text(encoding="utf-8")
        start = cls.source.index("private void LaunchSelfUpdater(")
        end = cls.source.index("private bool EnforceUpdatePolicy(", start)
        cls.method = cls.source[start:end]

    def test_update_script_uses_explicit_quoted_paths(self):
        self.assertIn(r'set \"DOWNLOADED=', self.method)
        self.assertIn(r'set \"TARGET=', self.method)
        self.assertIn(r'copy /Y \"%DOWNLOADED%\" \"%TARGET%\"', self.method)

    def test_update_script_verifies_replacement_before_deleting_download(self):
        self.assertIn("fc /b", self.method)
        self.assertIn("if errorlevel 1 goto wait", self.method)
        self.assertIn(r'del /F /Q \"%DOWNLOADED%\"', self.method)

    def test_update_script_has_delete_then_copy_fallback(self):
        self.assertIn("Fallback requested", self.method)
        self.assertIn(r'del /F /Q \"%TARGET%\"', self.method)
        self.assertIn(r'if not exist \"%TARGET%\" copy /Y \"%DOWNLOADED%\" \"%TARGET%\"', self.method)

    def test_update_script_reports_failure_and_keeps_download(self):
        self.assertIn(":failed", self.method)
        self.assertIn("msg *", self.method)
        self.assertIn(r'explorer.exe /select,\"%DOWNLOADED%\"', self.method)


if __name__ == "__main__":
    unittest.main()
