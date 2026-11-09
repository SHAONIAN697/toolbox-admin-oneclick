from pathlib import Path
import unittest


CLIENT_SOURCE = Path(__file__).parents[1] / "client-template" / "ToolboxClient.cs"


class ClientScrollLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CLIENT_SOURCE.read_text(encoding="utf-8")

    def test_audio_content_and_progress_use_separate_layout_rows(self):
        start = self.source.index("private void BuildAudioShell()")
        end = self.source.index("private Button MakeAudioChromeButton", start)
        shell = self.source[start:end]

        self.assertIn("TableLayoutPanel main = new TableLayoutPanel", shell)
        self.assertIn("main.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));", shell)
        self.assertIn("main.RowStyles.Add(new RowStyle(SizeType.Absolute, 54F));", shell)
        self.assertIn("main.Controls.Add(content, 0, 0);", shell)
        self.assertIn("main.Controls.Add(progressPanel, 0, 1);", shell)
        self.assertNotIn("progressPanel.BringToFront()", shell)

    def test_audio_download_area_fits_one_complete_task_row(self):
        start = self.source.index("private void RenderAudioDownloadsPage()")
        end = self.source.index("private RoundButton MakeAudioDownloadActionButton", start)
        page = self.source[start:end]

        self.assertIn("Math.Max(140, Math.Min(154", page)
        self.assertIn("Math.Max(DownloadTaskRowHeight + DownloadTaskRowGap", page)

    def test_download_task_row_does_not_have_fixed_overflow_width(self):
        self.assertIn("int taskRowWidth = Math.Max(1, taskListWidth - 16);", self.source)

    def test_portal_download_page_recalculates_outer_scroll_after_render(self):
        start = self.source.index("private void RenderPortalDownloadsPage()")
        end = self.source.index("private void RenderPortalSettingsPage()", start)
        page = self.source[start:end]

        self.assertIn("content.AutoScroll = true;", page)
        self.assertIn("RenderActiveDownloads();\n            UpdateContentScrolling();", page)
        self.assertIn("DisableHorizontalScrollbars(content);", page)


if __name__ == "__main__":
    unittest.main()
