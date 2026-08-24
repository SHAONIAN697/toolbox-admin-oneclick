import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AudioNavIconSizingTests(unittest.TestCase):
    def test_audio_menu_icons_use_fixed_canvas(self):
        for source_dir in ("ToolboxAdminApi-baota-source", "ToolboxAdminApi-oneclick"):
            source = (ROOT / "src" / source_dir / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")
            self.assertIn("QueueAudioNavIconLoad(iconUrl, button)", source)
            self.assertIn("FitImageOnCanvas(source, 22, 22, 18)", source)
            self.assertIn("new Bitmap(canvasWidth, canvasHeight, System.Drawing.Imaging.PixelFormat.Format32bppArgb)", source)
            self.assertIn("graphics.Clear(Color.Transparent)", source)

    def test_audio_window_uses_wechat_sized_responsive_default(self):
        for source_dir in ("ToolboxAdminApi-baota-source", "ToolboxAdminApi-oneclick"):
            source = (ROOT / "src" / source_dir / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")
            self.assertEqual(2, source.count("MinimumSize = new Size(760, 560);"))
            self.assertEqual(2, source.count("Math.Min(860, Math.Max(760, audioWorkArea.Width - 24))"))
            self.assertEqual(2, source.count("Math.Min(640, Math.Max(560, audioWorkArea.Height - 24))"))
            self.assertNotIn("Size = new Size(700, 500);", source)

    def test_client_config_sync_is_bounded_cached_and_does_not_stack_requests(self):
        for source_dir in ("ToolboxAdminApi-baota-source", "ToolboxAdminApi-oneclick"):
            source = (ROOT / "src" / source_dir / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")
            self.assertIn("ConfigRefreshBaseIntervalMs = 30000", source)
            self.assertIn("ConfigRefreshJitterMs = 15000", source)
            self.assertIn("refreshTimer.Interval = NextConfigRefreshInterval();", source)
            self.assertIn("if (loadingConfig) return;", source)
            self.assertIn("DownloadConfigText(WithRuntimeToken(configUrl", source)
            self.assertIn("return DownloadText(url, 4000, true);", source)
            self.assertIn('request.Headers["If-None-Match"] = configResponseEtag;', source)
            self.assertIn("HttpStatusCode.NotModified", source)
            self.assertIn("后台连接较慢，保留当前配置并稍后重试", source)

    def test_audio_text_buttons_grow_for_wrapped_labels(self):
        for source_dir in ("ToolboxAdminApi-baota-source", "ToolboxAdminApi-oneclick"):
            source = (ROOT / "src" / source_dir / "client-template" / "ToolboxClient.cs").read_text(encoding="utf-8")
            self.assertIn("TextFormatFlags.WordBreak | TextFormatFlags.HorizontalCenter | TextFormatFlags.NoPadding", source)
            if source_dir == "ToolboxAdminApi-oneclick":
                self.assertIn("bool expandedLayout = false;", source)
                self.assertIn("AsList(Get(AsDict(pageSectionObj), \"buttons\")).Count > 10", source)
                self.assertIn("int columns = expandedLayout ? 4 : 5;", source)
                self.assertIn("Math.Min(72, measured.Height + 14)", source)
                self.assertIn("int gap = expandedLayout ? 10 : 5;", source)
                self.assertIn("expandedLayout ? 9.5F : 8.5F", source)
            else:
                self.assertIn("Math.Min(62, measured.Height + 10)", source)
            self.assertIn("int buttonHeight = useIconLayout ? 104 : rowHeights[row];", source)
            self.assertIn("AutoEllipsis = useIconLayout", source)


if __name__ == "__main__":
    unittest.main()
