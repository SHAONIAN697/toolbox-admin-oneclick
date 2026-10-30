import unittest
from pathlib import Path


ADMIN_JS = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "wwwroot"
    / "admin.js"
)


class ClientUpdateSettingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = ADMIN_JS.read_text(encoding="utf-8")
        start = cls.source.index("async function saveAppUpdateSettings()")
        end = cls.source.index("\nasync function saveApp()", start)
        cls.method = cls.source[start:end]

    def test_saving_update_entry_preserves_basic_version(self):
        self.assertIn("version: $('appVersion')?.value.trim() || state.config?.app?.version || '',", self.method)
        self.assertNotIn("version: original.version || state.config?.app?.version || '',", self.method)

    def test_variant_version_stays_in_variant_settings(self):
        self.assertIn("version: value('version')", self.method)
        self.assertIn("update_variants: updateVariants", self.method)


if __name__ == "__main__":
    unittest.main()
