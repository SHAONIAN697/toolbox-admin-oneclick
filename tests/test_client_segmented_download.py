import unittest
from pathlib import Path


CLIENT_SOURCE = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "client-template"
    / "ToolboxClient.cs"
)


class SegmentedDownloadTemplateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CLIENT_SOURCE.read_text(encoding="utf-8")

    def test_keeps_32_segment_workers(self):
        self.assertIn("private const int MaxSegmentedDownloadConnections = 32;", self.source)
        self.assertIn("return MaxSegmentedDownloadConnections;", self.source)

    def test_range_workers_use_the_original_url_like_the_legacy_downloader(self):
        method_start = self.source.index("private HttpWebResponse OpenDownloadResponse(")
        method_end = self.source.index("private static HttpWebRequest CreateDownloadHttpRequest(", method_start)
        method = self.source[method_start:method_end]

        loop = "for (int redirect = 0; redirect < 8; redirect++)"
        request = "HttpWebRequest request = CreateDownloadHttpRequest(task, current"
        self.assertIn("string current = url;", method)
        self.assertNotIn("current = task.LastResolvedUrl;", method)
        self.assertLess(method.index(loop), method.index(request))

    def test_fast_start_probe_uses_legacy_timeout(self):
        probe_start = self.source.index("private RemoteDownloadInfo ProbeRemoteDownloadInfo(")
        probe_end = self.source.index("private HttpWebResponse OpenProbeDownloadResponse(", probe_start)
        probe = self.source[probe_start:probe_end]

        self.assertIn("int timeout = task.FastStartDirectDownload ? 4000 : 12000;", probe)

    def test_legacy_download_path_does_not_run_drive_switching(self):
        attempt_start = self.source.index("private void DownloadFileAttempt(")
        attempt_end = self.source.index("private bool TryCreateSegmentedDownloadPlan(", attempt_start)
        attempt = self.source[attempt_start:attempt_end]

        self.assertNotIn("EnsureDownloadDriveSpace", attempt)


if __name__ == "__main__":
    unittest.main()
