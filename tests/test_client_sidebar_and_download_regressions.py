import unittest
from pathlib import Path


CLIENT_SOURCE = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "client-template"
    / "ToolboxClient.cs"
)


class ClientSidebarAndDownloadRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CLIENT_SOURCE.read_text(encoding="utf-8")

    def method(self, start, end):
        begin = self.source.index(start)
        finish = self.source.index(end, begin)
        return self.source[begin:finish]

    def test_audio_sidebar_does_not_inject_unconfigured_pages(self):
        build_nav = self.method("private void BuildNav()", "private void QueueShowPage(")
        audio_branch = build_nav[build_nav.index("if (audioVariant)"):build_nav.index("if (tunerVariant || vst76Variant)")]
        self.assertIn('foreach (object item in AsList(Get(config, "sidebar")))', audio_branch)
        self.assertNotIn('AddAudioNavButton("toolbox"', audio_branch)
        self.assertIn("IsStudioOverviewPage(id, AsDict(Get(audioPages, id)))", audio_branch)
        self.assertIn('AddAudioNavButton(SoftwareCatalogPageId, "软件大全", "")', audio_branch)

    def test_vst76_sidebar_uses_backend_order_without_legacy_fixed_menu(self):
        build_nav = self.method("private void BuildNav()", "private void QueueShowPage(")
        vst_start = build_nav.index("if (vst76Variant)")
        first_loop = build_nav.index("foreach (object item in tunerSidebar)", vst_start)
        vst_end = build_nav.index("foreach (object item in tunerSidebar)", first_loop + 1)
        vst_branch = build_nav[vst_start:vst_end]
        self.assertIn("foreach (object item in tunerSidebar)", vst_branch)
        self.assertIn("NavLabel(row, id, tunerPages)", vst_branch)
        for legacy_call in (
            'AddTunerNavButton("toolbox"',
            'AddTunerNavButton("driver"',
            'AddTunerNavButton("plugins"',
            'AddTunerNavButton("websites"',
        ):
            self.assertNotIn(legacy_call, vst_branch)
        self.assertIn('AddTunerNavButton(SoftwareCatalogPageId, "软件大全"', vst_branch)

    def test_flagship_configured_buttons_use_catalog_style_icon_cards(self):
        self.assertIn("CreateVst76ConfiguredActionCard", self.source)
        group = self.method("private Panel CreateTunerGroup", "private Control CreateVst76ConfiguredActionCard")
        self.assertIn("Vst76ConfiguredButtonUsesCard(buttons[i])", group)
        self.assertIn("Control button = useCard", group)
        self.assertIn('vst76Variant && !useCard && action == "download"', group)
        card = self.method("private Control CreateVst76ConfiguredActionCard", "private Control CreateTunerActionButton")
        self.assertIn("CreateSoftwareCatalogIconImage(iconEntry, accent, 44)", card)
        self.assertIn("QueueSoftwareCatalogIconLoad(iconUrl, icon)", card)
        self.assertIn("RunResourceItemAction(item, info)", card)
        self.assertIn("CreateVst76InlineProgress(nameText, true)", card)

    def test_configured_home_label_is_not_replaced_by_flagship_overview(self):
        home_match = self.method("private bool IsVst76HomePage", "private bool IsConfiguredVst76HomeLabel")
        self.assertIn("Vst76HomePageId", home_match)
        self.assertIn("StudioOverviewPageId", home_match)
        self.assertNotIn('String.Equals(label, "首页"', home_match)
        show_page = self.method("private void ShowPage(string id)", "private void ShowTemplateUtilityPage(")
        self.assertIn("IsVst76HomePage(id, AsDict(Get(pages, id)))", show_page)
        self.assertIn("RenderVst76HomePage();", show_page)
        self.assertIn('title.Text = "系统概览";', show_page)
        self.assertIn('RenderSections(AsList(Get(page, "sections")));', show_page)

    def test_brand_avatar_keeps_remote_loader_and_can_retry(self):
        loader = self.method("private void ApplyAppIcon", "private void SetAppIconImage")
        self.assertIn("LoadRemoteImage(resolved, 34, 34)", loader)
        self.assertIn('failedIcons.Remove("app|" + cacheKey)', loader)
        self.assertNotIn("LoadEmbeddedBrandIcon", loader)

    def test_non_studio_variants_hide_overview_by_id_or_label(self):
        self.assertIn("private bool IsStudioOverviewPage", self.source)
        self.assertIn('String.Equals(label.Trim(), "系统概览", StringComparison.OrdinalIgnoreCase)', self.source)
        self.assertIn("if (!studioVariant && IsStudioOverviewPage", self.source)

    def test_button_download_policy_reaches_tasks_records_and_paused_state(self):
        required = (
            'GetText(item, "download_directory", GetText(item, "download_path", ""))',
            'BoolValue(item, "download_delete_on_exit", false)',
            "EnsureWritableDownloadDirectory(customDirectory)",
            "task.CustomDownloadDirectory = result.CustomDirectory;",
            "task.DeleteOnExit = result.DeleteOnExit;",
            "state.CustomDownloadDirectory = task.CustomDownloadDirectory;",
            "task.CustomDownloadDirectory = state.CustomDownloadDirectory ?? \"\";",
            "DeleteOnExit = deleteOnExit",
            "record != null && record.DeleteOnExit",
        )
        for value in required:
            self.assertIn(value, self.source)

    def test_download_cleanup_is_not_blocking_form_close(self):
        closing = self.method("protected override void OnFormClosing", "private void PositionSettingsPanel")
        self.assertIn("ThreadPool.QueueUserWorkItem", closing)
        self.assertIn("CleanupDownloadedFilesOnExit", closing)


if __name__ == "__main__":
    unittest.main()
