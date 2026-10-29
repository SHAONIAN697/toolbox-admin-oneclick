# Copyright (c) 2026 少年科技工作室. All rights reserved.
from pathlib import Path
import tarfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"
ADMIN_JS = ROOT / "src" / "ToolboxAdminApi-oneclick" / "wwwroot" / "admin.js"
ADMIN_HTML = ROOT / "src" / "ToolboxAdminApi-oneclick" / "wwwroot" / "index.html"
CLIENT_CS = ROOT / "src" / "ToolboxAdminApi-oneclick" / "client-template" / "ToolboxClient.cs"
CLIENT_HTA = ROOT / "src" / "ToolboxAdminApi-oneclick" / "client-template" / "toolbox.hta"
LATEST_PACKAGE = ROOT / "packages" / "toolbox-admin-local-latest.tar.gz"


class CopyrightAttributionTests(unittest.TestCase):
    def test_executable_metadata_does_not_force_studio_attribution(self):
        source = APP.read_text(encoding="utf-8")
        self.assertIn('PROJECT_PUBLISHER = "少年科技工作室"', source)
        self.assertIn('return "" if PROJECT_PUBLISHER in text else text', source)
        self.assertEqual(source.count('exe_company = exe_metadata_value(app_config.get("exe_company"))'), 2)
        self.assertEqual(source.count('exe_copyright = exe_metadata_value(app_config.get("exe_copyright"))'), 2)
        self.assertNotIn("PROJECT_COPYRIGHT", source)

    def test_admin_metadata_fields_remain_optional_and_filter_studio_attribution(self):
        script = ADMIN_JS.read_text(encoding="utf-8-sig")
        self.assertIn("$('appExeCompany').value = cleanExeMetadata(app.exe_company);", script)
        self.assertIn("$('appExeCopyright').value = cleanExeMetadata(app.exe_copyright);", script)
        self.assertIn("return text.includes('少年科技工作室') ? '' : text;", script)
        self.assertNotIn("readOnly = true", script)

    def test_attribution_is_limited_to_admin_web_and_repository(self):
        client = CLIENT_CS.read_text(encoding="utf-8")
        hta = CLIENT_HTA.read_text(encoding="utf-8")
        admin = ADMIN_HTML.read_text(encoding="utf-8")
        self.assertNotIn("WithStudioAttribution", client)
        self.assertNotIn('subtitle ? subtitle + " · © 2026 少年科技工作室"', hta)
        self.assertIn('content="少年科技工作室"', admin)
        self.assertIn("少年科技工作室 · 配置中心", admin)

    def test_latest_deployment_package_contains_source_copyright_notice(self):
        with tarfile.open(LATEST_PACKAGE, "r:gz") as package:
            name = "ToolboxAdminApi-oneclick/COPYRIGHT.md"
            members = package.getnames()
            self.assertIn(name, members)
            self.assertFalse(any(member == "ToolboxAdminApi-oneclick/data" or member.startswith("ToolboxAdminApi-oneclick/data/") for member in members))
            self.assertFalse(any(member.endswith(".log") or member.endswith(".pyc") for member in members))
            notice = package.extractfile(name).read().decode("utf-8")
            readme = package.extractfile("ToolboxAdminApi-oneclick/README.md").read().decode("utf-8-sig")
        self.assertIn("少年科技工作室", notice)
        self.assertIn("2026-10-29 品牌署名范围调整", readme)
        self.assertIn("不写入工作室公司名或版权信息", readme)


if __name__ == "__main__":
    unittest.main()
