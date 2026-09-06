import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "src" / "ToolboxAdminApi-oneclick"

def load_app():
    spec = importlib.util.spec_from_file_location("oneclick_vst76_tests", PROJECT / "app.py")
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module

class Vst76CatalogTests(unittest.TestCase):
    def setUp(self):
        self.app = load_app(); self.app.SOFTWARE_CATALOG_CACHE = {"home": None, "search": {}}; self.app.SOFTWARE_CATALOG_RESOLVE_CACHE = {}

    def test_variant_registration_and_aes_vector(self):
        self.assertEqual("调音师工具箱旗舰版", self.app.CLIENT_VARIANTS["vst76"]["label"])
        self.assertEqual("vst76", self.app.client_variant_file_suffix("vst76"))
        encrypted = self.app.aes128_cbc_encrypt(bytes.fromhex("00112233445566778899aabbccddeeff"), bytes.fromhex("000102030405060708090a0b0c0d0e0f"), bytes(16))
        self.assertEqual("69c4e0d86a7b0430d8cdb78070b4c55a", encrypted[:16].hex())
        self.assertIn("data", json.loads(self.app._catalog_post_payload({"searchKey": "QQ"})))

    def test_parse_dedupe_and_ssrf(self):
        upstream = {"data": [{"dataList": [{"apps": [{"softID": "1", "softName": "A"}, {"softID": "1", "softName": "duplicate"}, {"softID": "2", "softName": "B"}]}]}]}
        with patch.object(self.app, "_catalog_http", return_value=upstream): rows, source = self.app.software_catalog_home(True)
        self.assertEqual(("online", ["1", "2"]), (source, [row["id"] for row in rows]))
        self.app.SOFTWARE_CATALOG_RESOLVE_CACHE["1"] = {"bizInfo": "b", "expires": 9999999999}
        with patch.object(self.app, "_catalog_http", return_value={"data": {"downloadUrls": [{"downLoadUrl": "file:///x"}, {"downLoadUrl": "https://127.0.0.1/x"}]}}):
            self.assertIsNone(self.app.software_catalog_resolve("1"))

    def test_client_and_admin_use_flagship_shared_paths(self):
        cs = (PROJECT / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")
        js = (PROJECT / "wwwroot" / "admin.js").read_text(encoding="utf-8")
        self.assertIn('Program.ClientVariant.Equals("vst76"', cs)
        self.assertIn('"/api/client/software-catalog/"', cs)
        self.assertIn("version != remoteSoftwareCatalogRequestVersion", cs)
        self.assertIn("DownloadFile(url, entry.Name);", cs)
        self.assertIn("RenderVst76SettingsPage()", cs)
        self.assertIn("Text = GetDownloadDirectory()", cs)
        self.assertIn("SaveDownloadDirectory(dialog.SelectedPath, settings)", cs)
        self.assertIn("QueueSoftwareCatalogIconLoad(entry.IconUrl, icon)", cs)
        self.assertIn("Image.FromStream(stream, true, true)", cs)
        self.assertIn("useOnlyReferenceCatalog", cs)
        self.assertIn("Vst76InlineDownloadProgress progress", cs)
        self.assertIn('if (action == "download")', cs)
        self.assertIn("if (vst76Variant) displayAppTitle = appTitle;", cs)
        self.assertIn("RowCount = vst76Variant ? 3 : 2", cs)
        self.assertNotIn('MakeVst76SideUtilityButton("⟳ 同步配置"', cs)
        self.assertIn("if (type === 'vst76')", js)

    def test_software_catalog_scrolls_in_every_client_variant(self):
        cs = (PROJECT / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")
        render = cs[cs.index("private void RenderSoftwareCatalogPage()" ):cs.index("private int SoftwareCatalogContentWidth()")]
        refresh = cs[cs.index("private void RefreshSoftwareCatalogResults()" ):cs.index("private void QueueRemoteSoftwareCatalogLoad")]
        self.assertIn("ResetContentScrollState();", render)
        self.assertIn("content.AutoScroll = true;", render)
        self.assertNotIn("if (vst76Variant) content.AutoScroll = true;", render)
        self.assertIn("content.AutoScrollMinSize = new Size", refresh)
        self.assertIn("UpdateContentScrolling();", refresh)
        self.assertNotIn("if (vst76Variant)\n                    content.AutoScrollMinSize", refresh)

    def test_flagship_home_and_reference_commands(self):
        cs = (PROJECT / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")
        self.assertIn("RenderVst76HomePage()", cs)
        self.assertIn("CreateVst76MetricRow(width)", cs)
        self.assertIn("CreateVst76ResourcePanel(width)", cs)
        self.assertIn("Vst76HomeButtons()", cs)
        self.assertIn("powercfg -s 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", cs)
        self.assertIn("ipconfig /release & ipconfig /flushdns", cs)
        self.assertIn("netsh advfirewall reset", cs)
        self.assertIn("EmptyWorkingSet(process.Handle)", cs)
        self.assertIn("MessageBoxButtons.YesNo", cs)

    def test_flagship_memory_cleanup_keeps_reference_intervals(self):
        cs = (PROJECT / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")
        self.assertIn("int[] cleanupIntervals = { 0, 1, 2, 3, 5, 10, 15, 30, 60 };", cs)
        self.assertIn('"关闭", "1 分钟", "2 分钟", "3 分钟", "5 分钟", "10 分钟", "15 分钟", "30 分钟", "60 分钟"', cs)
        self.assertIn("vst76MemoryCleanupTimer.Interval = vst76MemoryCleanupMinutes * 60 * 1000;", cs)
        self.assertIn("vst76MemoryCleanupTimer.Stop();", cs)
        self.assertNotIn('autoClean.Items.AddRange(new object[] { "关闭", "开启" });', cs)

if __name__ == "__main__": unittest.main()
