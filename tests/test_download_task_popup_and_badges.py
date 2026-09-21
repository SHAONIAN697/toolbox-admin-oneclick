import unittest
from pathlib import Path


CLIENT_SOURCE = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "client-template"
    / "ToolboxClient.cs"
)


class DownloadTaskPopupAndBadgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CLIENT_SOURCE.read_text(encoding="utf-8")

    def method(self, start, end):
        begin = self.source.index(start)
        finish = self.source.index(end, begin)
        return self.source[begin:finish]

    def test_original_download_does_not_open_task_popup_automatically(self):
        download = self.method(
            "private void DownloadFile(string url, string displayName, string backupUrl",
            "private DownloadRequest ResolveDownloadRequest",
        )
        resume = self.method(
            "private bool ResumeMatchedDownloadTask",
            "private bool ForceResumeDownloadTask",
        )
        self.assertNotIn("ShowDownloadRecordsPanel();", download)
        self.assertNotIn("ShowDownloadRecordsPanel();", resume)

    def test_download_icons_have_badges_in_original_audio_and_flagship(self):
        self.assertIn("recordsButton = MakeOriginalDownloadChromeButton();", self.source)
        self.assertIn("downloadTasksButton = MakeAudioDownloadChromeButton(\"下载任务\");", self.source)
        tuner_shell = self.method("private void BuildTunerShell()", "private void BuildStudioShell")
        self.assertIn("windowControls.Controls.Add(downloadTasksButton);", tuner_shell)
        badges = self.method("private void UpdateDownloadBadges()", "private void ShowContactWindowFromButton")
        self.assertIn("!studioVariant && !tunerVariant && !portalVariant && !audioVariant && !vst76Variant", badges)
        self.assertIn("if (audioVariant || vst76Variant)", badges)
        self.assertIn("chrome.BadgeText = count > 0", badges)

    def test_badge_button_draws_download_icon_and_count(self):
        button = self.method("private sealed class TunerDownloadChromeButton", "private sealed class StudioChromeButton")
        self.assertIn("public string BadgeText = \"\";", button)
        self.assertIn("DrawDownloadIcon", button)
        self.assertIn("TextRenderer.DrawText(g, text, badgeFont, badge, Color.White", button)
        self.assertIn("EffectiveBackColor(this)", button)


if __name__ == "__main__":
    unittest.main()
