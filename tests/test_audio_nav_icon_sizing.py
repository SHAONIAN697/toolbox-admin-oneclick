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


if __name__ == "__main__":
    unittest.main()
