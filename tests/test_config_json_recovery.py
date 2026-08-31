import importlib.util
import os
import tempfile
import unittest
from pathlib import Path


APP_PATH = Path(__file__).parents[1] / "src" / "ToolboxAdminApi-oneclick" / "app.py"
os.environ.setdefault("TOOLBOX_ADMIN_TOKEN", "test-admin-password")
spec = importlib.util.spec_from_file_location("toolbox_config_recovery_app", APP_PATH)
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class ConfigJsonRecoveryTests(unittest.TestCase):
    def test_concatenated_configs_recover_latest_complete_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            path.write_text('{"app":{"title":"old"}}\n{"app":{"title":"latest"}}', encoding="utf-8")

            recovered = app.read_toolbox_config_json(path, {})

            self.assertEqual("latest", recovered["app"]["title"])
            self.assertEqual(recovered, app.read_json(path, {}))
            backups = list((path.parent / "config-recovery-backups").glob("*.json"))
            self.assertEqual(1, len(backups))
            self.assertIn('"old"', backups[0].read_text(encoding="utf-8"))

    def test_invalid_single_config_reports_clear_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            path.write_text('{"app":', encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "工具箱配置 JSON 已损坏"):
                app.read_toolbox_config_json(path, {})


if __name__ == "__main__":
    unittest.main()
