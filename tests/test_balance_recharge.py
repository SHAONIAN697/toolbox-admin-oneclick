import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"


def load_app():
    spec = importlib.util.spec_from_file_location("toolbox_balance_recharge_app", APP_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BalanceRechargeTests(unittest.TestCase):
    def setUp(self):
        self.app = load_app()
        self.temp = tempfile.TemporaryDirectory()
        data = Path(self.temp.name)
        self.app.DATA = data
        self.app.USER_DATA = data / "users"
        self.app.USERS_PATH = data / "users.json"
        self.app.SYSTEM_PATH = data / "system.json"
        self.app.ORDERS_PATH = data / "orders.json"
        self.app.NOTICES_PATH = data / "notices.json"
        self.agent = {
            "id": "agent-a",
            "username": "agent-a",
            "displayName": "代理甲",
            "role": "agent",
            "active": True,
            "balance": 12.5,
        }
        self.admin = {"id": "admin", "username": "admin", "role": "super", "active": True}
        self.app.write_json(self.app.USERS_PATH, {
            "users": [self.admin, self.agent],
            "inviteCodes": [],
            "settings": {},
        })
        self.app.write_json(self.app.SYSTEM_PATH, {})
        self.app.write_orders({"orders": []})

    def tearDown(self):
        self.temp.cleanup()

    def test_quote_is_agent_only_and_validates_amount(self):
        with self.assertRaisesRegex(ValueError, "只有代理账号"):
            self.app.balance_quote_for_actor(self.admin, {"amount": 10})
        with self.assertRaisesRegex(ValueError, "不能少于"):
            self.app.balance_quote_for_actor(self.agent, {"amount": 0})
        with self.assertRaisesRegex(ValueError, "有效数字"):
            self.app.balance_quote_for_actor(self.agent, {"amount": "nan"})
        quote = self.app.balance_quote_for_actor(self.agent, {"amount": "28.88"})
        self.assertEqual(28.88, quote["amount"])
        self.assertEqual(12.5, quote["balance"])

    def test_create_recharge_order_uses_selected_interface(self):
        channels = [{"key": "easypay", "label": "易支付一 / 支付宝", "paymentType": "alipay"}]
        with mock.patch.object(self.app, "public_payment_channels", return_value=channels), \
                mock.patch.object(self.app, "build_payment_url", return_value="https://pay.example/order"), \
                mock.patch.object(self.app, "add_system_notice"), \
                mock.patch.object(self.app, "send_admin_event_email"):
            result = self.app.create_balance_recharge_order(self.agent, {
                "amount": 50,
                "paymentChannel": "easypay",
                "paymentType": "alipay",
            }, "http://127.0.0.1:5089")
        order = self.app.read_orders()["orders"][0]
        self.assertEqual("recharge_balance", order["action"])
        self.assertEqual("interface", order["paymentMethod"])
        self.assertEqual("easypay", order["paymentProvider"])
        self.assertEqual("alipay", order["paymentType"])
        self.assertEqual("https://pay.example/order", result["paymentUrl"])

    def test_fulfillment_adds_balance_only_once(self):
        order = {
            "id": "order-recharge",
            "action": "recharge_balance",
            "userId": self.agent["id"],
            "amount": 20.25,
            "status": "pending",
        }
        with mock.patch.object(self.app, "resolve_order_pending_notice"):
            self.assertTrue(self.app.fulfill_balance_recharge_order(order, paid=True, external_trade_no="trade-1"))
            self.assertTrue(self.app.fulfill_balance_recharge_order(order, paid=True, external_trade_no="trade-1"))
        saved_agent = next(user for user in self.app.read_users()["users"] if user["id"] == self.agent["id"])
        self.assertEqual(32.75, saved_agent["balance"])
        self.assertEqual(32.75, order["balanceAfter"])
        self.assertEqual("trade-1", order["externalTradeNo"])
        self.assertTrue(order["fulfilledAt"])


if __name__ == "__main__":
    unittest.main()
