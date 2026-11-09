from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]
APP_SOURCE = (ROOT / "app.py").read_text(encoding="utf-8")
ADMIN_SOURCE = (ROOT / "wwwroot" / "admin.js").read_text(encoding="utf-8")


class CloudEntitlementMessageTests(unittest.TestCase):
    def test_button_api_returns_chinese_entitlement_error(self):
        self.assertIn(
            '"error": "当前账号尚未开通网盘解析，请先开通或续费网盘解析授权。", "code": "USER_ENTITLEMENT_REQUIRED"',
            APP_SOURCE,
        )

    def test_add_button_maps_cloud_errors_before_display(self):
        start = ADMIN_SOURCE.index("async function addButton()")
        end = ADMIN_SOURCE.index("async function saveButton", start)
        add_button = ADMIN_SOURCE[start:end]
        self.assertIn("throw new Error(cloudErrorMessage(error));", add_button)

    def test_entitlement_error_has_chinese_mapping(self):
        self.assertIn(
            "cloud resolver entitlement required': '当前账号尚未开通网盘解析，请先开通或续费网盘解析授权。'",
            ADMIN_SOURCE,
        )


if __name__ == "__main__":
    unittest.main()
