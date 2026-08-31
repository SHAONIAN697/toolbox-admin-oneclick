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
            backups = list((path.parent / "json-recovery-backups").glob("*.json"))
            self.assertEqual(1, len(backups))
            self.assertIn('"old"', backups[0].read_text(encoding="utf-8"))

    def test_invalid_single_config_reports_clear_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "config.json"
            path.write_text('{"app":', encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "工具箱配置 JSON 已损坏"):
                app.read_toolbox_config_json(path, {})

    def test_client_integrity_recovers_concatenated_records(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            original_path = app.CLIENT_INTEGRITY_PATH
            app.CLIENT_INTEGRITY_PATH = Path(temp_dir) / "client-integrity.json"
            try:
                app.CLIENT_INTEGRITY_PATH.write_text(
                    '{"builds":{"old":{}},"tokens":{}}\n'
                    '{"builds":{"latest":{}},"tokens":{}}',
                    encoding="utf-8",
                )

                recovered = app.read_client_integrity()

                self.assertIn("latest", recovered["builds"])
                self.assertNotIn("old", recovered["builds"])
                self.assertEqual(1, len(list((Path(temp_dir) / "json-recovery-backups").glob("*.json"))))
            finally:
                app.CLIENT_INTEGRITY_PATH = original_path


if __name__ == "__main__":
    unittest.main()
