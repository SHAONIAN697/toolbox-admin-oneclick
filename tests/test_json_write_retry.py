import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


APP_PATH = Path(__file__).parents[1] / "src" / "ToolboxAdminApi-oneclick" / "app.py"
spec = importlib.util.spec_from_file_location("toolbox_json_write_retry_app", APP_PATH)
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class JsonWriteRetryTests(unittest.TestCase):
    def test_write_json_retries_transient_windows_permission_error(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "notices.json"
            real_replace = app.os.replace
            calls = {"count": 0}

            def flaky_replace(source, destination):
                calls["count"] += 1
                if calls["count"] < 3:
                    raise PermissionError(13, "file is temporarily locked")
                return real_replace(source, destination)

            with patch.object(app.os, "replace", side_effect=flaky_replace):
                app.write_json(target, {"notices": [{"id": "n1"}]})

            self.assertEqual({"notices": [{"id": "n1"}]}, app.read_json(target, {}))
            self.assertEqual(3, calls["count"])


if __name__ == "__main__":
    unittest.main()
