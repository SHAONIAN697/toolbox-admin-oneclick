import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"
SPEC = importlib.util.spec_from_file_location("toolbox_audit_detail_app", APP_PATH)
APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APP)


class AuditDetailGroupingTests(unittest.TestCase):
    def test_announcement_read_requests_do_not_create_generic_audit_entries(self):
        self.assertFalse(APP.should_write_generic_audit("/api/admin/announcements/read-all", "POST"))
        self.assertFalse(APP.should_write_generic_audit("/api/admin/announcements/read-batch", "POST"))
        self.assertFalse(APP.should_write_generic_audit("/api/admin/announcements/notice-1/read", "POST"))
        self.assertTrue(APP.should_write_generic_audit("/api/admin/announcements", "POST"))
        self.assertTrue(APP.should_write_generic_audit("/api/admin/announcements/notice-1/publish", "POST"))

    def test_basic_settings_changes_are_grouped_in_one_detail_block(self):
        before = {
            "app": {"title": "a", "version": "1.0", "allow_client_theme": False},
            "features": {"delete_downloads_on_exit": False},
        }
        after = {
            "app": {"title": "B", "version": "2.0", "allow_client_theme": True},
            "features": {"delete_downloads_on_exit": True},
        }
        details = APP.basic_settings_audit_details(
            before,
            after,
            {
                "title": "B",
                "version": "2.0",
                "allow_client_theme": True,
                "delete_downloads_on_exit": True,
            },
            "/api/admin/app",
        )
        self.assertEqual(details["title"], "修改基础信息")
        self.assertEqual(details["category"], "basic")
        self.assertEqual(len(details["changes"]), 4)
        self.assertIn(
            {"field": "工具箱名称", "before": "a", "after": "B"},
            details["changes"],
        )
        self.assertIn(
            {"field": "关闭时删除已下载文件", "before": "已关闭", "after": "已开启"},
            details["changes"],
        )

    def test_unchanged_settings_do_not_generate_field_changes(self):
        config = {
            "app": {"title": "工具箱"},
            "features": {"delete_downloads_on_exit": True},
        }
        details = APP.basic_settings_audit_details(
            config,
            config,
            {"title": "工具箱", "delete_downloads_on_exit": True},
            "/api/admin/app",
        )
        self.assertEqual(details["changes"], [])

    def test_popup_details_use_contact_wording_and_hide_link_values(self):
        before = {"enabled": False, "contacts": [], "payments": [], "links": []}
        after = {
            "enabled": True,
            "contacts": [{"title": "客服微信", "image": "https://secret.example/qr.png"}],
            "payments": [],
            "links": [{"title": "官网", "url": "https://secret.example/path"}],
        }
        details = APP.popup_settings_audit_details(before, after, "/api/admin/popup")
        payload = json.dumps(details, ensure_ascii=False)
        self.assertEqual(details["title"], "修改联系方式")
        self.assertIn("联系方式弹窗", payload)
        self.assertIn("客服微信", payload)
        self.assertNotIn("secret.example", payload)

    def test_new_button_log_omits_link_and_execution_target(self):
        after_row = {
            "area": "主页",
            "section": "常用工具",
            "raw": {
                "name": "新按钮",
                "enabled": True,
                "action": "link",
                "target": "https://secret.example/download",
                "url": "https://secret.example/download",
                "files": [{"url": "https://secret.example/file.exe"}],
            },
        }
        details = APP.button_audit_details("create", None, after_row, "/api/admin/buttons")
        payload = json.dumps(details, ensure_ascii=False)
        self.assertEqual(details["title"], "新增按钮：新按钮")
        self.assertIn("按钮名称", payload)
        self.assertIn("所在位置", payload)
        self.assertNotIn("secret.example", payload)
        self.assertNotIn("链接或执行目标", payload)

    def test_button_update_hides_changed_target_content(self):
        before_row = {
            "area": "主页",
            "section": "常用工具",
            "raw": {"name": "下载", "enabled": True, "action": "link", "target": "https://old.example"},
        }
        after_row = {
            "area": "主页",
            "section": "常用工具",
            "raw": {"name": "下载", "enabled": True, "action": "link", "target": "https://new.example"},
        }
        details = APP.button_audit_details("update", before_row, after_row, "/api/admin/buttons")
        payload = json.dumps(details, ensure_ascii=False)
        self.assertIn("链接或执行目标", payload)
        self.assertIn("内容已隐藏", payload)
        self.assertNotIn("old.example", payload)
        self.assertNotIn("new.example", payload)

    def test_audit_file_keeps_only_recent_entries_within_capacity(self):
        original_path = APP.AUDIT_LOG_PATH
        original_max_bytes = APP.AUDIT_LOG_MAX_BYTES
        original_keep_events = APP.AUDIT_LOG_KEEP_EVENTS
        try:
            with tempfile.TemporaryDirectory() as folder:
                APP.AUDIT_LOG_PATH = Path(folder) / "audit.jsonl"
                APP.AUDIT_LOG_MAX_BYTES = 700
                APP.AUDIT_LOG_KEEP_EVENTS = 10
                for index in range(8):
                    APP.audit_event("test", details={"index": index, "value": "x" * 120})
                lines = APP.AUDIT_LOG_PATH.read_text(encoding="utf-8").splitlines()
                indexes = [json.loads(line)["details"]["index"] for line in lines]
                self.assertLessEqual(APP.AUDIT_LOG_PATH.stat().st_size, APP.AUDIT_LOG_MAX_BYTES)
                self.assertEqual(indexes, list(range(8 - len(indexes), 8)))
        finally:
            APP.AUDIT_LOG_PATH = original_path
            APP.AUDIT_LOG_MAX_BYTES = original_max_bytes
            APP.AUDIT_LOG_KEEP_EVENTS = original_keep_events

    def test_all_distributed_sources_include_detail_dialog_and_single_basic_save(self):
        for source_dir in (
            "ToolboxAdminApi",
            "ToolboxAdminApi-baota-source",
            "ToolboxAdminApi-no-agent",
            "ToolboxAdminApi-oneclick",
        ):
            base = ROOT / "src" / source_dir
            app_source = (base / "app.py").read_text(encoding="utf-8")
            js_source = (base / "wwwroot" / "admin.js").read_text(encoding="utf-8")
            css_source = (base / "wwwroot" / "styles.css").read_text(encoding="utf-8")
            self.assertIn("should_write_generic_audit", app_source)
            self.assertIn('audit_event("config_basic_update"', app_source)
            self.assertIn('audit_event("contact_settings_update"', app_source)
            self.assertIn("function openAuditDetail(item)", js_source)
            self.assertIn('class="audit-log-row"', js_source)
            self.assertIn("rows.auditRenderSignature", js_source)
            self.assertIn("delete_downloads_on_exit: deleteDownloadsOnExit", js_source)
            self.assertNotIn("await saveWholeConfig('基础信息已保存。');", js_source)
            self.assertIn(".audit-detail-card", css_source)
            self.assertIn(".audit-change-row", css_source)
            self.assertIn("max-height: calc(100vh - 36px)", css_source)


if __name__ == "__main__":
    unittest.main()
