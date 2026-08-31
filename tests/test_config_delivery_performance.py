import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRS = ("ToolboxAdminApi-oneclick",)


class ConfigDeliveryPerformanceTests(unittest.TestCase):
    def test_server_caches_compresses_and_conditionally_returns_config(self):
        for source_dir in SOURCE_DIRS:
            source = (ROOT / "src" / source_dir / "app.py").read_text(encoding="utf-8")
            self.assertIn("PUBLIC_CONFIG_CACHE = {}", source)
            self.assertIn("gzip.compress(data, compresslevel=5)", source)
            self.assertIn('self.headers.get("If-None-Match", "").strip() == etag', source)
            self.assertIn('self.send_response(304)', source)
            self.assertIn('self.send_header("Content-Encoding", "gzip")', source)
            self.assertIn('TOOLBOX_MAX_REQUEST_THREADS', source)

    def test_service_restart_loop_is_rate_limited(self):
        for source_dir in SOURCE_DIRS:
            service = (
                ROOT / "src" / source_dir / "deploy" / "baota" / "toolbox-admin.service"
            ).read_text(encoding="utf-8")
            self.assertIn("StartLimitIntervalSec=60", service)
            self.assertIn("StartLimitBurst=5", service)
            self.assertIn("Restart=on-failure", service)
            self.assertIn("RestartSec=10", service)
            self.assertNotIn("Restart=always", service)


if __name__ == "__main__":
    unittest.main()
