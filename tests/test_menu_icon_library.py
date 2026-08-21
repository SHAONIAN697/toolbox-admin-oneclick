import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ("ToolboxAdminApi-baota-source", "ToolboxAdminApi-oneclick")


class FakeResponse:
    def __init__(self, payload, url="https://cdn.example.test/icons/list.json", content_type="application/json"):
        self.payload = payload
        self.url = url
        self.headers = {"Content-Type": content_type}

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
        with patch.object(module.urllib.request, "urlopen", return_value=FakeResponse(payload)), patch.object(module, "cache_library_icon", side_effect=lambda url, _token="": url):
            icons, error = module.read_remote_menu_icons("https://cdn.example.test/icons/list.json")
        self.assertEqual("", error)
        self.assertEqual("系统工具", icons[0]["name"])
        self.assertEqual("https://cdn.example.test/icons/images/system.png", icons[0]["url"])
        self.assertTrue(icons[0]["library"])

    def test_html_directory_uses_openlist_api_instead_of_parsing_markup(self):
        app_path = ROOT / "src" / SOURCES[0] / "app.py"
        spec = importlib.util.spec_from_file_location("toolbox_menu_icon_html_test_app", app_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        page = FakeResponse(b"<!doctype html><html><head></head></html>", "https://wd.example.test/d/icons", "text/html")
        rows = [{"name": "office365", "url": "https://wd.example.test/d/icons/office365.png"}]
        with patch.object(module.urllib.request, "urlopen", return_value=page), patch.object(module, "openlist_icon_sources", return_value=rows), patch.object(module, "cache_library_icon", return_value="/uploads/menu-icon-library/cached.png"):
            icons, error = module.read_remote_menu_icons("https://wd.example.test/d/icons", "secret")
        self.assertEqual("", error)
        self.assertEqual(["office365"], [item["name"] for item in icons])
        self.assertEqual("/uploads/menu-icon-library/cached.png", icons[0]["url"])

    def test_account_password_login_supplies_openlist_token(self):
        app_path = ROOT / "src" / SOURCES[0] / "app.py"
        spec = importlib.util.spec_from_file_location("toolbox_menu_icon_login_test_app", app_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        page = FakeResponse(b"<!doctype html><html></html>", "https://wd.example.test/icons", "text/html")
        rows = [{"name": "icon", "url": "https://wd.example.test/d/icons/icon.png"}]
        with patch.object(module, "openlist_login", return_value="temporary-token") as login, patch.object(module.urllib.request, "urlopen", return_value=page), patch.object(module, "openlist_icon_sources", return_value=rows) as listing, patch.object(module, "cache_library_icon", return_value="/uploads/menu-icon-library/icon.png"):
            icons, error = module.read_remote_menu_icons("https://wd.example.test/icons", "", "admin", "password")
        self.assertEqual(1, len(icons))
        self.assertEqual("", error)
        login.assert_called_once()
        self.assertEqual("temporary-token", listing.call_args.args[1])

    def test_invalidated_account_token_is_replaced_and_retried(self):
        app_path = ROOT / "src" / SOURCES[0] / "app.py"
        spec = importlib.util.spec_from_file_location("toolbox_menu_icon_retry_test_app", app_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        page = FakeResponse(b"<!doctype html><html></html>", "https://wd.retry.test/icons", "text/html")
        rows = [{"name": "icon", "url": "https://wd.retry.test/d/icons/icon.png"}]
        with patch.object(module, "openlist_login", side_effect=["old-token", "new-token"]) as login, patch.object(module.urllib.request, "urlopen", return_value=page), patch.object(module, "openlist_icon_sources", side_effect=[ValueError("token is invalidated"), rows]) as listing, patch.object(module, "cache_library_icon", return_value="/uploads/menu-icon-library/icon.png"):
            icons, error = module.read_remote_menu_icons("https://wd.retry.test/icons", "", "admin", "password")
        self.assertEqual("", error)
        self.assertEqual(1, len(icons))
        self.assertEqual(2, login.call_count)
        self.assertEqual("new-token", listing.call_args.args[1])

    def test_admin_ui_uses_visual_picker_without_exposing_selected_url(self):
        for source_dir in SOURCES:
            base = ROOT / "src" / source_dir
            script = (base / "wwwroot" / "admin.js").read_text(encoding="utf-8")
            markup = (base / "wwwroot" / "index.html").read_text(encoding="utf-8")
            styles = (base / "wwwroot" / "styles.css").read_text(encoding="utf-8")
            self.assertIn('id="manageScopeIconPreset" type="hidden"', markup)
            self.assertIn('id="scopeIconPicker"', markup)
            self.assertIn('从后台图标库选择', markup)
            self.assertIn('id="globalMenuIconFolder"', markup)
            self.assertIn('webkitdirectory', markup)
            self.assertNotIn('id="globalMenuIconLibraryUrl"', markup)
            self.assertNotIn('id="globalMenuIconLibraryUsername"', markup)
            self.assertNotIn('id="globalMenuIconLibraryPassword"', markup)
            self.assertNotIn('id="globalMenuIconLibraryToken"', markup)
            self.assertNotIn('id="manageScopeIconFile"', markup)
            self.assertNotIn('id="uploadScopeIconBtn"', markup)
            self.assertIn("function renderScopeIconPicker", script)
            self.assertNotIn("function uploadPositionIcon", script)
            config_load = script.index("state.config = await api(configApiPath())")
            deferred_icons = script.index("loadMenuIcons().then", config_load)
            self.assertGreater(deferred_icons, config_load)
            save_body = script.split("async function saveMenuIcons()", 1)[1].split("function renderBuiltinFunctions", 1)[0]
            self.assertNotIn("await loadMenuIcons()", save_body)
            self.assertIn("项目图标库已保存", save_body)
            self.assertIn("async function uploadMenuIconFolder()", script)
            backend = (base / "app.py").read_text(encoding="utf-8")
            self.assertIn('body.get("menuIcons")[:500]', backend)
            failure_body = script.split("function handleLoadFailure", 1)[1].split("function showLogin", 1)[0]
            self.assertIn("if (!silent)", failure_body)
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
