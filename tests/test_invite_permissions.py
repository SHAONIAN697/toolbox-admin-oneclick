import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"


def load_app():
    spec = importlib.util.spec_from_file_location("toolbox_invite_permission_app", APP_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeHandler:
    def __init__(self, app, body=None):
        self.app = app
        self.body = body or {}
        self.headers = {}
        self.query = {}

    def read_body(self):
        return self.body

    def send_json(self, value, status=200):
        return status, value

    def base_url(self):
        return "http://127.0.0.1:5089"


class InvitePermissionTests(unittest.TestCase):
    def setUp(self):
        self.app = load_app()
        self.temp = tempfile.TemporaryDirectory()
        data = Path(self.temp.name)
        self.app.DATA = data
        self.app.USER_DATA = data / "users"
        self.app.USERS_PATH = data / "users.json"
        self.app.SYSTEM_PATH = data / "system.json"
        self.app.SESSIONS_PATH = data / "sessions.json"
        self.app.ORDERS_PATH = data / "orders.json"
        self.app.write_json(self.app.SYSTEM_PATH, {})
        self.admin = {"id": "admin", "username": "admin", "role": "super", "active": True}
        self.agent = {"id": "agent-a", "username": "agent-a", "role": "agent", "active": True,
                      "balance": 0, "agentLevelId": "level-1", "agentLevelName": "一级代理"}
        self.other_agent = {"id": "agent-b", "username": "agent-b", "role": "agent", "active": True,
                            "balance": 0, "agentLevelId": "level-1", "agentLevelName": "一级代理"}
        self.store = {
            "users": [self.admin, self.agent, self.other_agent],
            "inviteCodes": [
                {"code": "ADMIN-1", "active": True, "usedCount": 0, "maxUses": 1,
                 "createdById": "admin"},
                {"code": "AGENT-1", "active": True, "usedCount": 0, "maxUses": 1,
                 "createdById": "agent-a", "ownerAgentId": "agent-a"},
                {"code": "OTHER-1", "active": True, "usedCount": 0, "maxUses": 1,
                 "createdById": "agent-b", "ownerAgentId": "agent-b"},
                {"code": "USED-1", "active": True, "usedCount": 1, "maxUses": 2,
                 "createdById": "agent-a", "ownerAgentId": "agent-a"},
            ],
            "settings": {},
        }
        self.app.write_json(self.app.USERS_PATH, self.store)

    def tearDown(self):
        self.temp.cleanup()

    def call(self, actor, method, body=None, path="/api/super/invites"):
        handler = FakeHandler(self.app, body)
        return self.app.Handler.handle_super(handler, path, method, {"user": actor})

    def test_agent_list_is_scoped_and_cannot_delete(self):
        status, result = self.call(self.agent, "GET")
        self.assertEqual(200, status)
        self.assertEqual({"AGENT-1", "USED-1"}, {row["code"] for row in result["invites"]})
        status, result = self.call(self.agent, "DELETE", {"code": "AGENT-1"})
        self.assertEqual(403, status)
        self.assertIn("不能删除", result["error"])

    def test_super_disable_cannot_be_reenabled_by_agent(self):
        status, _ = self.call(self.admin, "PATCH", {"code": "AGENT-1", "active": False})
        self.assertEqual(200, status)
        status, result = self.call(self.agent, "PATCH", {"code": "AGENT-1", "active": True})
        self.assertEqual(403, status)
        self.assertIn("总管理员停用", result["error"])

    def test_used_invites_cannot_change_active_state(self):
        for actor in (self.agent, self.admin):
            status, result = self.call(actor, "PATCH", {"code": "USED-1", "active": False})
            self.assertEqual(400, status)
            self.assertIn("使用后", result["error"])

    def test_agent_cannot_clear_admin_lock_by_disabling_again(self):
        self.call(self.admin, "PATCH", {"code": "AGENT-1", "active": False})
        for patch in ({"active": False}, {"active": True}, {"superDisabled": False}, {"maxUses": 100}):
            status, _ = self.call(self.agent, "PATCH", {"code": "AGENT-1", **patch})
            self.assertEqual(403, status)
        status, item = self.call(self.admin, "PATCH", {"code": "AGENT-1", "active": True})
        self.assertEqual(200, status)
        self.assertFalse(item["superDisabled"])

    def test_agent_can_restore_own_disable_but_not_legacy_disable(self):
        self.call(self.agent, "PATCH", {"code": "AGENT-1", "active": False})
        self.assertEqual(200, self.call(self.agent, "PATCH", {"code": "AGENT-1", "active": True})[0])
        self.store["inviteCodes"][1]["active"] = False
        self.app.write_json(self.app.USERS_PATH, self.store)
        self.assertEqual(403, self.call(self.agent, "PATCH", {"code": "AGENT-1", "active": True})[0])

    def test_agent_cannot_modify_others_or_bulk_delete(self):
        for code in ("ADMIN-1", "OTHER-1"):
            self.assertEqual(404, self.call(self.agent, "PATCH", {"code": code, "active": False})[0])
        self.assertEqual(403, self.call(self.agent, "DELETE", {"codes": ["AGENT-1", "ADMIN-1"]})[0])
        self.assertEqual(4, len(self.app.read_users()["inviteCodes"]))

    def test_paid_order_results_are_owner_scoped(self):
        self.app.write_orders({"orders": [{"id": "paid-test", "userId": "agent-a", "displayName": "Test",
            "status": "paid", "action": "create_invites", "fulfilledAt": self.app.now_iso(),
            "fulfilledInviteCodes": ["AGENT-1"]}]})
        for actor in (self.agent, self.admin):
            status, result = self.call(actor, "GET", path="/api/super/orders/paid-test")
            self.assertEqual(200, status)
            self.assertEqual(["AGENT-1"], result["fulfilledInviteCodes"])
        self.assertEqual(403, self.call(self.other_agent, "GET", path="/api/super/orders/paid-test")[0])

    def test_super_can_delete_agent_invites(self):
        status, result = self.call(self.admin, "DELETE", {"codes": ["AGENT-1"]})
        self.assertEqual(200, status)
        self.assertEqual(1, result["deleted"])


if __name__ == "__main__":
    unittest.main()
