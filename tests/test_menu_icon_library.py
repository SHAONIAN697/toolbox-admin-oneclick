import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ("ToolboxAdminApi-baota-source", "ToolboxAdminApi-oneclick")


class FakeResponse:
    def __init__(self, payload, url="https://cdn.example.test/icons/list.json"):
        self.payload = payload
        self.url = url

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit):
        return self.payload

    def geturl(self):
        return self.url


class MenuIconLibraryTests(unittest.TestCase):
    def test_remote_manifest_is_normalized_as_read_only_library_icons(self):
        app_path = ROOT / "src" / SOURCES[0] / "app.py"
        spec = importlib.util.spec_from_file_location("toolbox_menu_icon_test_app", app_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        payload = json.dumps({"icons": [{"name": "系统工具", "url": "images/system.png"}]}).encode()
        with patch.object(module.urllib.request, "urlopen", return_value=FakeResponse(payload)):
            icons, error = module.read_remote_menu_icons("https://cdn.example.test/icons/list.json")
        self.assertEqual("", error)
        self.assertEqual("系统工具", icons[0]["name"])
        self.assertEqual("https://cdn.example.test/icons/images/system.png", icons[0]["url"])
        self.assertTrue(icons[0]["library"])

    def test_admin_ui_uses_visual_picker_without_exposing_selected_url(self):
        for source_dir in SOURCES:
            base = ROOT / "src" / source_dir
            script = (base / "wwwroot" / "admin.js").read_text(encoding="utf-8")
            markup = (base / "wwwroot" / "index.html").read_text(encoding="utf-8")
            styles = (base / "wwwroot" / "styles.css").read_text(encoding="utf-8")
            self.assertIn('id="manageScopeIconPreset" type="hidden"', markup)
            self.assertIn('id="scopeIconPicker"', markup)
            self.assertIn('从后台图标库选择', markup)
            self.assertNotIn('id="manageScopeIconFile"', markup)
            self.assertNotIn('id="uploadScopeIconBtn"', markup)
            self.assertIn("function renderScopeIconPicker", script)
            self.assertNotIn("function uploadPositionIcon", script)
            self.assertIn("$('manageScopeIconUrl').value = '';", script)
            self.assertIn("const icons = Array.isArray(state.system?.menuIcons)", script)
            self.assertNotIn("state.system.menuIcons = state.menuIcons", script)
            self.assertIn(".icon-picker-popover", styles)

    def test_collapsed_panel_hides_grouped_actions(self):
        for source_dir in SOURCES:
            styles = (ROOT / "src" / source_dir / "wwwroot" / "styles.css").read_text(encoding="utf-8")
            self.assertIn(".collapsible-panel.is-collapsed .panel-head > .button-pair", styles)


if __name__ == "__main__":
    unittest.main()
