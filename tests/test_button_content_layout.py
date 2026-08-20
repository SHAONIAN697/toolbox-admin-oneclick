import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "src" / "ToolboxAdminApi-baota-source"


def load_app():
    spec = importlib.util.spec_from_file_location("toolbox_app_layout_tests", PROJECT / "app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ButtonContentLayoutBackendTests(unittest.TestCase):
    def setUp(self):
        self.app = load_app()
        self.temp = tempfile.TemporaryDirectory()
        data = Path(self.temp.name)
        self.app.DATA = data
        self.app.USER_DATA = data / "users"
        self.app.USERS_PATH = data / "users.json"
        self.app.USER_TEMPLATE_PATH = data / "user-template.json"

    def tearDown(self):
        self.temp.cleanup()

    def test_default_and_old_config_use_icon_left(self):
        self.assertEqual("icon_left", self.app.default_config()["app"]["button_content_layout"])
        legacy = {"app": {"title": "legacy"}}
        self.app.write_config(legacy, "legacy")
        self.assertEqual("icon_left", self.app.read_config("legacy")["app"]["button_content_layout"])

    def test_valid_values_save_and_invalid_value_normalizes(self):
        cfg = self.app.default_config()
        for value in ("none", "icon_left", "icon_top"):
            self.app.apply_app_patch(cfg, {"button_content_layout": value})
            self.assertEqual(value, cfg["app"]["button_content_layout"])
        self.app.apply_app_patch(cfg, {"button_content_layout": "other"})
        self.assertEqual("icon_left", cfg["app"]["button_content_layout"])

    def test_users_and_public_config_are_isolated(self):
        for user_id, value in (("user-a", "icon_top"), ("user-b", "icon_left")):
            cfg = self.app.default_config()
            self.app.apply_app_patch(cfg, {"button_content_layout": value})
            self.app.write_config(cfg, user_id)
        self.app.write_json(self.app.USERS_PATH, {"users": [
            {"id": "user-a", "apiKey": "key-a", "active": True},
            {"id": "user-b", "apiKey": "key-b", "active": True},
        ], "inviteCodes": []})
        user_a = self.app.find_user_by_api_key("key-a")
        user_b = self.app.find_user_by_api_key("key-b")
        self.assertEqual("icon_top", self.app.public_toolbox_config(user_a["id"])["app"]["button_content_layout"])
        self.assertEqual("icon_left", self.app.public_toolbox_config(user_b["id"])["app"]["button_content_layout"])
        self.assertEqual("icon_left", self.app.read_config("user-b")["app"]["button_content_layout"])

    def test_target_user_requires_super_role(self):
        class Handler:
            headers = {"X-Target-User": "user-b"}
            query = {"targetUserId": ["user-b"]}

        normal = {"user": {"id": "user-a", "role": "user"}}
        self.assertEqual("user-a", self.app.target_user_id(normal, Handler()))
        self.app.write_json(self.app.USERS_PATH, {"users": [{"id": "user-b", "role": "user"}], "inviteCodes": []})
        super_user = {"user": {"id": "admin", "role": "super"}}
        self.assertEqual("user-b", self.app.target_user_id(super_user, Handler()))


class ButtonContentLayoutClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = (PROJECT / "wwwroot" / "admin.js").read_text(encoding="utf-8")
        cls.cs = (PROJECT / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")

    def test_admin_auto_save_rolls_back_without_mutating_state_on_failure(self):
        start = self.js.index("async function saveButtonContentLayout")
        body = self.js[start:self.js.index("async function saveAppLoginSettings", start)]
        self.assertIn("renderButtonContentLayout(previous)", body)
        self.assertLess(body.index("const saved = await api"), body.index("state.config = saved"))
        catch_body = body[body.index("} catch (error)"):]
        self.assertNotIn("state.config =", catch_body)

    def test_exe_layout_change_is_normalized_cached_and_scoped(self):
        self.assertIn('GetText(app, "button_content_layout", "icon_left")', self.cs)
        self.assertIn("previousButtonContentLayout", self.cs)
        self.assertIn("RestoreContentScrollSoon(previousScroll)", self.cs)
        self.assertIn("GetCachedButtonIcon(iconUrl)", self.cs)
        self.assertIn("ScheduleBusinessIconRefresh()", self.cs)
        self.assertIn("Interval = 120", self.cs)
        self.assertIn("ApplyBusinessButtonLayout(card, !String.IsNullOrWhiteSpace(iconUrl))", self.cs)
        self.assertIn("ApplyBusinessButtonLayout(action, !String.IsNullOrWhiteSpace(iconUrl))", self.cs)
        method = self.cs[self.cs.index("private void ApplyBusinessButtonLayout"):self.cs.index("private string BuildActionTip")]
        self.assertNotIn("navButtons", method)
        self.assertNotIn("windowControls", method)
        self.assertIn("if (button == null || !hasConfiguredIcon) return", method)
        self.assertIn("if (hasConfiguredIcon)", method)

    def test_layout_uses_dpi_aware_font_metrics_and_wrapped_top_text(self):
        self.assertIn("52 + Font.Height * 2", self.cs)
        self.assertIn("card.Width = squareSize", self.cs)
        self.assertIn("card.Height = squareSize", self.cs)
        self.assertIn("button.Width = squareSize", self.cs)
        self.assertIn("button.Height = squareSize", self.cs)
        self.assertIn("TextFormatFlags.WordBreak", self.cs)
        self.assertIn("TextFormatFlags.EndEllipsis", self.cs)
        self.assertIn("TextImageRelation.ImageAboveText", self.cs)


if __name__ == "__main__":
    unittest.main()
