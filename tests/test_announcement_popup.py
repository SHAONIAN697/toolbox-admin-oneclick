import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"
SPEC = importlib.util.spec_from_file_location("toolbox_announcement_app", APP_PATH)
APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APP)


class AnnouncementPopupTests(unittest.TestCase):
    def test_batch_read_marks_only_current_available_revisions_once(self):
        rows = [
            {
                "id": "new-1",
                "status": "published",
                "enabled": True,
                "publish_time": "2026-08-20T00:00:00+00:00",
                "notification_revision": 1,
            },
            {
                "id": "new-2",
                "status": "published",
                "enabled": True,
                "publish_time": "2026-08-21T00:00:00+00:00",
                "notification_revision": 3,
            },
            {
                "id": "draft",
                "status": "draft",
                "enabled": True,
                "notification_revision": 1,
            },
        ]
        reads = []
        user = {"id": "user-1", "username": "tester"}
        references = [
            {"id": "new-1", "notification_revision": 1},
            {"id": "new-1", "notification_revision": 1},
            {"id": "new-2", "notification_revision": 2},
            {"id": "draft", "notification_revision": 1},
        ]

        marked = APP.mark_admin_announcement_batch_read(rows, reads, user, references)

        self.assertEqual(marked, 1)
        self.assertEqual(len(reads), 1)
        self.assertEqual(reads[0]["announcement_id"], "new-1")
        self.assertEqual(reads[0]["notification_revision"], 1)
        self.assertEqual(
            APP.mark_admin_announcement_batch_read(rows, reads, user, references),
            0,
        )

    def test_force_popup_is_disabled_for_new_and_edited_announcements(self):
        created = APP.normalize_announcement_payload({"title": "更新", "content": "内容", "force_popup": True})
        edited = APP.normalize_announcement_payload(
            {"title": "更新", "content": "内容", "force_popup": True},
            {"force_popup": True},
        )
        self.assertFalse(created["force_popup"])
        self.assertFalse(edited["force_popup"])

    def test_all_distributed_copies_use_one_time_aggregate_popup(self):
        for source_dir in ("ToolboxAdminApi-oneclick",):
            base = ROOT / "src" / source_dir
            app_source = (base / "app.py").read_text(encoding="utf-8")
            js_source = (base / "wwwroot" / "admin.js").read_text(encoding="utf-8")
            self.assertIn('path == "/api/admin/announcements/read-batch"', app_source)
            self.assertIn("and not item.get(\"read\")", app_source)
            self.assertNotIn('or item.get("force_popup")', app_source)
            self.assertIn("announcementPopupNewItems", js_source)
            self.assertIn("announcement-popup-list", js_source)
            self.assertIn("markAdminAnnouncementPopupShown", js_source)
            self.assertNotIn("每次登录弹出", js_source)


if __name__ == "__main__":
    unittest.main()
