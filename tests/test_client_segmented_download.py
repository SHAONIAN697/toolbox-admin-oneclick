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

    def test_fast_start_probe_uses_short_timeout(self):
        probe_start = self.source.index("private RemoteDownloadInfo ProbeRemoteDownloadInfo(")
        probe_end = self.source.index("private HttpWebResponse OpenProbeDownloadResponse(", probe_start)
        probe = self.source[probe_start:probe_end]

        self.assertIn("int timeout = task.FastStartDirectDownload ? 1500 : 12000;", probe)

    def test_cloud_proxy_is_not_marked_as_fast_start(self):
        self.assertIn('uri.AbsolutePath.Equals("/api/cloud-resolver/download-file"', self.source)
        policy_start = self.source.index("private static bool ShouldFastStartDownload(")
        policy_end = self.source.index("private DownloadRequest ResolveCloud189ClientDownloadRequest(", policy_start)
        policy = self.source[policy_start:policy_end]
        self.assertIn("if (IsCloudDownloadEndpoint(request.Url)) return false;", policy)

    def test_probe_preserves_permanent_provider_failures(self):
        probe_start = self.source.index("private RemoteDownloadInfo ProbeRemoteDownloadInfo(")
        probe_end = self.source.index("private HttpWebResponse OpenProbeDownloadResponse(", probe_start)
        probe = self.source[probe_start:probe_end]
        self.assertIn("catch (Exception ex)", probe)
        self.assertIn("if (IsPermanentDownloadFailure(ex)) throw;", probe)

    def test_permanent_failure_handles_wrapped_410_and_has_clear_record(self):
        failure_start = self.source.index("private static bool IsPermanentDownloadFailure(")
        failure_end = self.source.index("private static string ResolveRedirectUrl(", failure_start)
        failure = self.source[failure_start:failure_end]
        self.assertIn('message.IndexOf("(410)"', failure)
        finish_start = self.source.index("private void FinishControlledDownload(")
        finish_end = self.source.index("private void CleanupSegmentedPart(", finish_start)
        finish = self.source[finish_start:finish_end]
        self.assertIn("bool permanentFailure = IsPermanentDownloadFailure(failure);", finish)
        self.assertIn('"下载源不可用"', finish)

    def test_backup_download_retries_before_opening_backup_page(self):
        worker_start = self.source.index("private void DownloadFileWorker(")
        worker_end = self.source.index("private bool TrySwitchToBackupDownload(", worker_start)
        worker = self.source[worker_start:worker_end]

        self.assertIn("private const int MaxDownloadAttemptsPerUrl = 6;", self.source)
        self.assertIn("if (attempt >= MaxDownloadAttemptsPerUrl)", worker)
        self.assertIn("task.UsingBackup", worker)
        self.assertNotIn("if (task.UsingBackup && !String.IsNullOrWhiteSpace(task.BackupPageUrl)) break;", worker)

        finish_start = self.source.index("private void FinishControlledDownload(")
        finish_end = self.source.index("private void CleanupSegmentedPart(", finish_start)
        finish = self.source[finish_start:finish_end]
        self.assertIn("Open(task.BackupPageUrl);", finish)
        self.assertIn("备用下载地址多次失败，准备打开备用网页", worker)

    def test_legacy_download_path_does_not_run_drive_switching(self):
        attempt_start = self.source.index("private void DownloadFileAttempt(")
        attempt_end = self.source.index("private bool TryCreateSegmentedDownloadPlan(", attempt_start)
        attempt = self.source[attempt_start:attempt_end]

        self.assertNotIn("EnsureDownloadDriveSpace", attempt)

    def test_restored_tasks_render_after_download_list_handle_is_created(self):
        render_start = self.source.index("private void RenderActiveDownloads()")
        render_end = self.source.index("private void RestoreActiveDownloadScroll(", render_start)
        render = self.source[render_start:render_end]
        self.assertIn("if (!activeDownloadsList.IsHandleCreated)", render)
        self.assertIn("QueueActiveDownloadsRender();", render)

        queue_start = self.source.index("private void QueueActiveDownloadsRender()")
        queue_end = self.source.index("private void RenderActiveDownloads()", queue_start)
        queue = self.source[queue_start:queue_end]
        self.assertIn("list.HandleCreated -= ActiveDownloadsList_HandleCreated;", queue)
        self.assertIn("list.HandleCreated += ActiveDownloadsList_HandleCreated;", queue)
        self.assertIn("SafeRenderActiveDownloads();", queue)

        restore_start = self.source.index("private void RestorePausedDownloadTasksOnce()")
        restore_end = self.source.index("private static PausedDownloadTaskState CreatePausedDownloadTaskState", restore_start)
        restore = self.source[restore_start:restore_end]
        self.assertIn("if (activeDownloadsList != null && !activeDownloadsList.IsDisposed)", restore)
        self.assertIn("RenderActiveDownloads();", restore)

    def test_multi_file_packages_queue_all_members_and_run_primary_after_success(self):
        self.assertIn('GetText(item, "download_mode", ""), "multiple"', self.source)
        self.assertIn("StartPackageDownload(item, info.Name)", self.source)
        self.assertIn("foreach (Dictionary<string, object> file in files)", self.source)
        self.assertIn("CompletePackageDownloadMember(task.PackageGroupId, task.Path, true)", self.source)
        self.assertIn("!group.Failed && !String.IsNullOrWhiteSpace(group.PrimaryPath)", self.source)
        self.assertIn("LaunchDownloadedFile(group.PrimaryPath)", self.source)


if __name__ == "__main__":
    unittest.main()
