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


if __name__ == "__main__":
    unittest.main()
