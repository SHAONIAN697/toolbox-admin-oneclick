import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-baota-source" / "app.py"


def load_app():
    spec = importlib.util.spec_from_file_location("toolbox_ip_location_tests", APP_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IpLocationConsensusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = load_app()

    def test_consensus_uses_region_majority_instead_of_first_result(self):
        results = [
            {"provider": "system", "address": "中国福建省福州市"},
            {"provider": "tencent", "address": "中国内蒙古自治区呼伦贝尔市"},
            {"provider": "pconline", "address": "内蒙古巴彦淖尔市"},
        ]
        selected = self.app.select_ip_location(results, {"mode": "consensus", "threshold": 2})
        self.assertIn("内蒙古", selected)

    def test_tied_regions_prefer_domestic_provider(self):
        results = [
            {"provider": "system", "address": "China Fujian Fuzhou"},
            {"provider": "tencent", "address": "中国内蒙古自治区"},
        ]
        selected = self.app.select_ip_location(results, {"mode": "consensus", "threshold": 2})
        self.assertIn("内蒙古", selected)

    def test_first_mode_keeps_configured_provider_order(self):
        results = [
            {"provider": "system", "address": "first"},
            {"provider": "tencent", "address": "second"},
        ]
        self.assertEqual("first", self.app.select_ip_location(results, {"mode": "first"}))

    def test_audit_history_reuses_cached_ip_location(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data = Path(temp_dir)
            self.app.AUDIT_LOG_PATH = data / "security-audit.jsonl"
            self.app.IP_CACHE_PATH = data / "ip-location-cache.json"
            self.app.USERS_PATH = data / "users.json"
            self.app.write_json(self.app.USERS_PATH, {"users": [], "inviteCodes": []})
            self.app.write_json(self.app.IP_CACHE_PATH, {
                "116.112.108.254": {"address": "内蒙古巴彦淖尔市", "time": 1}
            })
            self.app.AUDIT_LOG_PATH.write_text(
                json.dumps({"ip": "116.112.108.254", "action": "login_success"}) + "\n",
                encoding="utf-8",
            )
            item = self.app.read_audit_events()["items"][0]
            self.assertEqual("内蒙古巴彦淖尔市", item["ipAddress"])
            self.assertEqual(64, len(item["eventKey"]))


if __name__ == "__main__":
    unittest.main()
