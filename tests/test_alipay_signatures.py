import importlib.util
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse


APP_PATH = Path(__file__).parents[1] / "src" / "ToolboxAdminApi-oneclick" / "app.py"
spec = importlib.util.spec_from_file_location("toolbox_alipay_signature_app", APP_PATH)
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class AlipaySignatureTests(unittest.TestCase):
    def test_page_request_signature_includes_sign_type(self):
        payload = app.alipay_sign_payload({
            "app_id": "2021000000000000",
            "method": "alipay.trade.page.pay",
            "sign_type": "RSA2",
            "biz_content": '{"total_amount":"5.00"}',
        })
        self.assertIn("sign_type=RSA2", payload)

    def test_notify_signature_excludes_sign_type(self):
        payload = app.alipay_sign_payload({
            "app_id": "2021000000000000",
            "sign": "signature",
            "sign_type": "RSA2",
            "trade_status": "TRADE_SUCCESS",
        }, include_sign_type=False)
        self.assertNotIn("sign_type=", payload)
        self.assertNotIn("sign=", payload)

    def test_return_url_in_notify_field_is_replaced_with_callback(self):
        settings = app.default_system_settings()
        settings["pay"]["alipayChannel"] = "easypay"
        settings["pay"]["easypay"] = {
            "enabled": True,
            "apiUrl": "https://pay.example.test/",
            "pid": "1",
            "key": "secret",
            "notifyUrl": "https://example.test/api/payment/return",
            "returnUrl": "https://example.test/api/payment/return",
        }
        url = app.build_payment_url({
            "id": "order_test",
            "amount": 5,
            "detail": "邀请码",
            "paymentChannel": "easypay",
            "paymentType": "alipay",
        }, settings, "https://example.test")
        query = parse_qs(urlparse(url).query)
        self.assertEqual(["https://example.test/api/payment/callback"], query["notify_url"])
        self.assertEqual(["https://example.test/api/payment/return"], query["return_url"])


if __name__ == "__main__":
    unittest.main()
