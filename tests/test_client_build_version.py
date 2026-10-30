import unittest
from pathlib import Path


APP_SOURCE = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "app.py"
)


class ClientBuildVersionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = APP_SOURCE.read_text(encoding="utf-8")
        start = cls.source.index("def make_client_exe(")
        end = cls.source.index("\ndef admin_desktop_exe_filename", start)
        cls.method = cls.source[start:end]

    def test_embedded_client_version_comes_from_basic_version(self):
        self.assertIn('client_app_version = app_config.get("version") or "1.0"', self.method)
        self.assertNotIn('client_app_version = variant_update.get("version")', self.method)

    def test_update_variant_version_is_not_used_as_installed_version(self):
        marker = self.method[self.method.index("client_app_version =") :]
        self.assertNotIn("variant_update", marker)


if __name__ == "__main__":
    unittest.main()
