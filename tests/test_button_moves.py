import importlib.util
import unittest
from pathlib import Path


APP_PATH = Path(__file__).parents[1] / "src" / "ToolboxAdminApi-oneclick" / "app.py"
SPEC = importlib.util.spec_from_file_location("toolbox_admin_app", APP_PATH)
APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APP)


def button(button_id, name="Original"):
    return {
        "id": button_id,
        "name": name,
        "action": "link",
        "url": "https://example.test",
        "sort": 1,
    }


def config():
    return {
        "pages": {
            "downloads": {
                "title": "Downloads",
                "sections": [{"title": "Page group", "buttons": []}],
            }
        },
        "toolbox_tabs": [
            {
                "name": "System tools",
                "sections": [
                    {"title": "First", "buttons": [button("btn-1")]},
                    {"title": "Second", "buttons": []},
                ],
            }
        ],
    }


def update_request(**target):
    request = {
        "id": "btn-1",
        "scope": "toolbox",
        "tabIndex": 0,
        "sectionIndex": 0,
        "buttonIndex": 0,
        "button": {
            "name": "Updated",
            "action": "link",
            "target": "https://updated.example.test",
            "sort": 7,
            "enabled": True,
        },
    }
    request.update(target)
    return request


class ButtonMoveTests(unittest.TestCase):
    def test_updates_in_place_when_target_is_unchanged(self):
        cfg = config()

        APP.update_button(cfg, update_request())

        buttons = cfg["toolbox_tabs"][0]["sections"][0]["buttons"]
        self.assertEqual([item["id"] for item in buttons], ["btn-1"])
        self.assertEqual(buttons[0]["name"], "Updated")
        self.assertEqual(buttons[0]["sort"], 7)

    def test_moves_button_to_another_group(self):
        cfg = config()

        APP.update_button(
            cfg,
            update_request(
                targetScope="toolbox",
                targetTabIndex=0,
                targetSectionIndex=1,
            ),
        )

        sections = cfg["toolbox_tabs"][0]["sections"]
        self.assertEqual(sections[0]["buttons"], [])
        self.assertEqual([item["id"] for item in sections[1]["buttons"]], ["btn-1"])
        self.assertEqual(sections[1]["buttons"][0]["name"], "Updated")

    def test_moves_button_from_toolbox_to_page(self):
        cfg = config()

        APP.update_button(
            cfg,
            update_request(
                targetScope="page",
                targetPageId="downloads",
                targetSectionIndex=0,
            ),
        )

        self.assertEqual(cfg["toolbox_tabs"][0]["sections"][0]["buttons"], [])
        moved = cfg["pages"]["downloads"]["sections"][0]["buttons"]
        self.assertEqual([item["id"] for item in moved], ["btn-1"])
        self.assertEqual(moved[0]["url"], "https://updated.example.test")


if __name__ == "__main__":
    unittest.main()
