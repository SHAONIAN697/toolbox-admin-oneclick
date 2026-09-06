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
        vst_end = build_nav.index("if (!String.IsNullOrWhiteSpace(currentPage)", vst_start)
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

    def test_vst76_overview_is_prioritized_when_configured(self):
        build_nav = self.method("private void BuildNav()", "private void QueueShowPage(")
        vst_branch = build_nav[build_nav.index("if (vst76Variant)"):]
        overview_add = vst_branch.index("if (!id.Equals(StudioOverviewPageId")
        regular_loop = vst_branch.index("foreach (object item in tunerSidebar)", overview_add + 1)
        self.assertLess(overview_add, regular_loop)
        configured_home = self.method("private string ConfiguredVst76HomePageId", "private void BuildNav")
        self.assertLess(configured_home.index("StudioOverviewPageId"), configured_home.index("IsConfiguredVst76HomeLabel"))
        self.assertIn("Text = label", self.source)
        self.assertIn("AccessibleName = label", self.source)

    def test_flagship_configured_buttons_use_catalog_style_icon_cards(self):
        self.assertIn("CreateVst76ConfiguredActionCard", self.source)
        group = self.method("private Panel CreateTunerGroup", "private Control CreateVst76ConfiguredActionCard")
        self.assertIn("bool useCards = vst76Variant && Vst76ConfiguredPageUsesCards();", group)
        self.assertIn("Control button = useCards", group)
        self.assertIn('vst76Variant && !useCards && action == "download"', group)
        card_rule = self.method("private bool Vst76ConfiguredPageUsesCards", "private Control CreateVst76ConfiguredActionCard")
        self.assertIn('buttonContentLayout == "icon_top"', card_rule)
        self.assertIn("ButtonContentLayoutAppliesToCurrentPage()", card_rule)
        self.assertNotIn('GetText(item, "icon", "")', card_rule)
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

    def test_flagship_overview_is_responsive_and_has_no_vertical_scrollbar(self):
        overview = self.method("private void RenderVst76HomePage", "private void ResetVst76HomeControls")
        self.assertIn("ResetContentScrollState();", overview)
        self.assertIn("content.AutoScroll = false;", overview)
        self.assertIn("content.VerticalScroll.Visible = false;", overview)
        self.assertIn("Vst76OverviewUsesCompactLayout()", self.source)
        self.assertIn("int maxColumns = Math.Max(3", self.source)
        scrolling = self.method("private void UpdateContentScrolling", "private void BuildResourceSearchChrome")
        self.assertIn("vst76Variant && IsVst76HomePage", scrolling)
        self.assertIn("content.AutoScroll = false;", scrolling)

    def test_configured_button_icons_are_broadcast_and_retry_after_transient_failure(self):
        icon_loader = self.method("private void QueueSoftwareCatalogIconLoad", "private static byte[] DownloadSoftwareCatalogIconBytes")
        self.assertIn("softwareCatalogIconTargets", self.source)
        self.assertIn("if (!targets.Contains(target)) targets.Add(target);", icon_loader)
        self.assertIn("foreach (PictureBox pending in targets)", icon_loader)
        self.assertIn("ScheduleSoftwareIconRefresh();", icon_loader)
        button_loader = self.method("private void QueueButtonIconLoad(string url, Control target, int size)", "private void ScheduleBusinessIconRefresh")
        self.assertIn("for (int attempt = 0; attempt < 3 && image == null; attempt++)", button_loader)
        self.assertIn("failedIcons.Remove(cacheKey)", button_loader)

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
