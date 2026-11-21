import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "src" / "ToolboxAdminApi-oneclick" / "install-baota.sh"


class SafeLineNginxConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = INSTALLER.read_text(encoding="utf-8")
        match = re.search(r"python3 - \"\$conf\" \"\$port\".*?<<'PY'\n(.*?)\nPY\n  then", source, re.S)
        if not match:
            raise AssertionError("Nginx config generator heredoc not found")
        cls.generator = match.group(1)

    def run_generator(self, path, peer="", default=""):
        return subprocess.run(
            [sys.executable, "-c", self.generator, str(path), "5088",
             "# toolbox-admin one-click begin", "# toolbox-admin one-click end", peer, default],
            capture_output=True, text=True,
        )

    def test_host_network_peer_is_installed_and_repeat_update_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / "site.conf"
            config.write_text("server {\n    listen 443 ssl;\n}\n", encoding="utf-8")
            result = self.run_generator(config, default="127.0.0.1")
            self.assertEqual(0, result.returncode, result.stderr)
            first = config.read_text(encoding="utf-8")
            self.assertIn("set_real_ip_from 127.0.0.1/32;", first)
            self.assertIn("real_ip_header X-Forwarded-For;", first)
            self.assertIn("proxy_set_header X-Forwarded-For $remote_addr;", first)
            result = self.run_generator(config)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(first, config.read_text(encoding="utf-8"))

    def test_manual_peer_and_existing_real_ip_rules_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / "site.conf"
            config.write_text("server {\n    listen 443 ssl;\n}\n", encoding="utf-8")
            result = self.run_generator(config, peer="172.20.0.5")
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn("set_real_ip_from 172.20.0.5/32;", config.read_text(encoding="utf-8"))

            config.write_text("server {\n    set_real_ip_from 10.0.0.4;\n    real_ip_header X-Real-IP;\n}\n", encoding="utf-8")
            result = self.run_generator(config, peer="172.20.0.5")
            self.assertEqual(0, result.returncode, result.stderr)
            updated = config.read_text(encoding="utf-8")
            self.assertIn("set_real_ip_from 10.0.0.4;", updated)
            self.assertIn("real_ip_header X-Real-IP;", updated)
            self.assertNotIn("set_real_ip_from 172.20.0.5/32;", updated)

    def test_invalid_peer_leaves_site_config_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / "site.conf"
            original = "server {\n    listen 443 ssl;\n}\n"
            config.write_text(original, encoding="utf-8")
            result = self.run_generator(config, peer="0.0.0.0")
            self.assertNotEqual(0, result.returncode)
            self.assertEqual(original, config.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
