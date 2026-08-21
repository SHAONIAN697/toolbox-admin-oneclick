import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class VariantCoverPersistenceTests(unittest.TestCase):
    def test_upload_updates_state_and_save_reloads_server_values(self):
        for source_dir in ("ToolboxAdminApi-baota-source", "ToolboxAdminApi-oneclick"):
            script = (ROOT / "src" / source_dir / "wwwroot" / "admin.js").read_text(encoding="utf-8")
            self.assertIn("state.system.clientVariants[card.dataset.variantSetting] = {", script)
            self.assertIn("coverMode: 'upload'", script)
            self.assertIn("coverUrl: result.url", script)
            save_body = script.split("async function saveClientVariants()", 1)[1].split(
                "function renderPopupSettings()", 1
            )[0]
            self.assertIn("await loadClientVariants();", save_body)


if __name__ == "__main__":
    unittest.main()
