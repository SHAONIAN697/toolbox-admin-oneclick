import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"


def load_app():
    spec = importlib.util.spec_from_file_location("toolbox_download_count_tests", APP_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ClientVariantDownloadCountTests(unittest.TestCase):
    def setUp(self):
        self.app = load_app()
        self.temp = tempfile.TemporaryDirectory()
        self.app.CLIENT_DOWNLOAD_STATS_PATH = Path(self.temp.name) / "counts.json"
        self.app.CLIENT_BUILD_JOBS.clear()

    def tearDown(self):
        self.temp.cleanup()

    def test_counts_each_variant(self):
        self.assertEqual(1, self.app.record_client_download("audio"))
        self.assertEqual(2, self.app.record_client_download("audio"))
        counts = self.app.read_client_download_counts()
        self.assertEqual(2, counts["audio"])
        self.assertEqual(0, counts["portal"])

    def test_super_download_is_excluded_and_job_counts_once(self):
        self.app.CLIENT_BUILD_JOBS["job"] = {"variant": "studio"}
        self.assertFalse(self.app.record_client_build_download("job", {"role": "super"}))
        self.assertEqual(0, self.app.read_client_download_counts()["studio"])
        self.assertTrue(self.app.record_client_build_download("job", {"role": "user"}))
        self.assertFalse(self.app.record_client_build_download("job", {"role": "user"}))
        self.assertEqual(1, self.app.read_client_download_counts()["studio"])


if __name__ == "__main__":
    unittest.main()
