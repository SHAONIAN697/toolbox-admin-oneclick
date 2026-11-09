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
        self.assertIn("main.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));", shell)
        self.assertIn("main.Controls.Add(content, 0, 0);", shell)
        self.assertIn("main.Controls.Add(progressPanel, 0, 1);", shell)
        self.assertNotIn("progressPanel.BringToFront()", shell)

    def test_audio_download_area_fits_one_complete_task_row(self):
        start = self.source.index("private void RenderAudioDownloadsPage()")
        end = self.source.index("private RoundButton MakeAudioDownloadActionButton", start)
        page = self.source[start:end]

        self.assertIn("Math.Max(172, Math.Min(190", page)
        self.assertIn("Math.Max(DownloadTaskRowHeight + DownloadTaskRowGap", page)

    def test_download_task_row_does_not_have_fixed_overflow_width(self):
        self.assertIn("int taskRowWidth = Math.Max(1, taskListWidth - 20);", self.source)

    def test_audio_and_tuner_pages_recalculate_after_window_resize(self):
        resize = self.source[
            self.source.index("protected override void OnResize(EventArgs e)"):
            self.source.index("protected override void OnDeactivate(EventArgs e)")
        ]
        self.assertIn("portalVariant || audioVariant || tunerVariant || vst76Variant", resize)
        self.assertIn("QueueContentResizeRender();", resize)

    def test_portal_content_and_audio_sections_reserve_scrollbar_gutter(self):
        self.assertIn("ClientSize.Width - 236 - 26 - 32 - 12", self.source)
        self.assertIn("content.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth - 10", self.source)

    def test_scroll_range_keeps_bottom_controls_reachable(self):
        self.assertIn("int requiredScrollBottom = Math.Max(requiredBottom, sequentialContentHeight) + bottomPadding + 8;", self.source)
        self.assertIn("content.VerticalScroll.Visible = true;", self.source)

    def test_vst_home_does_not_force_fixed_width_or_disable_scroll(self):
        start = self.source.index("private void RenderVst76HomePage()")
        end = self.source.index("private void ResetVst76HomeControls()", start)
        page = self.source[start:end]
        self.assertIn("content.AutoScroll = true;", page)
        self.assertIn("content.VerticalScroll.Enabled = true;", page)
        self.assertIn("content.ClientSize.Width - content.Padding.Horizontal - 10", page)
        self.assertNotIn("content.VerticalScroll.Visible = false;", page)

    def test_xinggui_home_keeps_all_rows_reachable_without_width_overflow(self):
        start = self.source.index("private void RenderXingguiHomePage()")
        end = self.source.index("private RoundedPanel CreateXingguiHomePanel", start)
        page = self.source[start:end]
        self.assertIn("content.AutoScroll = true;", page)
        self.assertIn("content.VerticalScroll.Enabled = true;", page)
        self.assertIn("content.ClientSize.Width - content.Padding.Horizontal - SystemInformation.VerticalScrollBarWidth - 10", page)
        scrolling = self.source[
            self.source.index("private void UpdateContentScrolling()"):
            self.source.index("private void BuildResourceSearchChrome()")
        ]
        self.assertNotIn("xingguiVariant && currentPage == XingguiHomePageId", scrolling)

    def test_tuner_download_page_resets_scroll_and_recalculates_after_render(self):
        start = self.source.index("private void RenderTunerDownloadsPage()")
        end = self.source.index("private Control CreateTunerDownloadsHeader", start)
        page = self.source[start:end]
        self.assertIn("ResetContentScrollState();", page)
        self.assertIn("UpdateContentScrolling();", page)
        self.assertIn("DisableHorizontalScrollbars(content);", page)
        self.assertIn("ResizeDownloadRecordColumns();", page)

    def test_download_record_columns_fit_the_current_viewport(self):
        start = self.source.index("private void ResizeDownloadRecordColumns()")
        end = self.source.index("private static Color DialogBodyBack()", start)
        method = self.source[start:end]
        self.assertIn("int available = Math.Max(4, width - 4);", method)
        self.assertIn("recordsList.Columns[3].Width = Math.Max(1, available - timeWidth - resultWidth - nameWidth);", method)

    def test_portal_download_page_recalculates_outer_scroll_after_render(self):
        start = self.source.index("private void RenderPortalDownloadsPage()")
        end = self.source.index("private void RenderPortalSettingsPage()", start)
        page = self.source[start:end]

        self.assertIn("content.AutoScroll = true;", page)
        self.assertIn("RenderActiveDownloads();\n            UpdateContentScrolling();", page)
        self.assertIn("DisableHorizontalScrollbars(content);", page)

    def test_audio_and_portal_pages_start_with_vertical_scroll_enabled(self):
        audio = self.source[
            self.source.index("private void RenderAudioSections()"):
            self.source.index("private Control CreateAudioSection", self.source.index("private void RenderAudioSections()"))
        ]
        portal = self.source[
            self.source.index("private void RenderPortalSections()"):
            self.source.index("private void RenderPortalLoadingState", self.source.index("private void RenderPortalSections()"))
        ]
        self.assertIn("content.VerticalScroll.Visible = true;", audio)
        self.assertIn("content.VerticalScroll.Visible = true;", portal)

    def test_vst_download_page_uses_shared_scroll_calculation(self):
        scrolling = self.source[
            self.source.index("private void UpdateContentScrolling()"):
            self.source.index("private void BuildResourceSearchChrome()")
        ]
        self.assertNotIn('currentPage, "downloads"', scrolling)
        self.assertIn("sequentialContentHeight += child.Height + child.Margin.Vertical;", scrolling)
        self.assertIn("bool needsVerticalScroll = forceAudioSectionsScroll || requiredScrollBottom > content.ClientSize.Height + 2;", scrolling)

    def test_download_task_rows_use_actual_list_viewport_width(self):
        render = self.source[
            self.source.index("private void RenderActiveDownloads()"):
            self.source.index("private void RestoreActiveDownloadScroll", self.source.index("private void RenderActiveDownloads()"))
        ]
        self.assertIn("bool needsTaskScroll = studioInline ? tasks.Count > 1 : tasks.Count > visibleTaskRows;", render)
        self.assertIn("scrollPosition = Point.Empty;", render)
        self.assertIn("int liveTaskWidth = activeDownloadsList.ClientSize.Width - 20;", render)
        self.assertIn("if (row.Width != liveTaskWidth) row.Width = liveTaskWidth;", render)
        self.assertIn("int finalTaskWidth = activeDownloadsList.ClientSize.Width - 20;", render)

    def test_single_download_task_is_not_clipped_by_a_stale_inner_scroll_offset(self):
        start = self.source.index("private void RenderActiveDownloads()")
        end = self.source.index("private void RestoreActiveDownloadScroll", start)
        render = self.source[start:end]
        self.assertIn("int taskViewportHeight = Math.Max(1, activeDownloadsList.ClientSize.Height - activeDownloadsList.Padding.Vertical);", render)
        self.assertIn("int visibleTaskRows = Math.Max(1, (taskViewportHeight + DownloadTaskRowGap) / (DownloadTaskRowHeight + DownloadTaskRowGap));", render)
        self.assertIn("activeDownloadsList.AutoScrollPosition = Point.Empty;", render)
        self.assertLess(render.index("activeDownloadsList.AutoScrollPosition = Point.Empty;"), render.index("activeDownloadsList.AutoScroll = needsTaskScroll;"))

    def test_portal_empty_download_state_fills_the_active_task_viewport(self):
        start = self.source.index("private void RenderActiveDownloads()")
        end = self.source.index("private void RestoreActiveDownloadScroll", start)
        render = self.source[start:end]
        self.assertIn("int emptyHeight = studioInline || portalVariant", render)
        self.assertIn("activeDownloadsList.ClientSize.Height - activeDownloadsList.Padding.Vertical", render)

    def test_portal_download_task_area_tracks_live_task_count(self):
        start = self.source.index("private void BuildPortalDownloadTable(int width)")
        end = self.source.index("private void AttachDownloadRecordContextMenu", start)
        build = self.source[start:end]
        self.assertIn("DownloadTaskListHeight(activePadding, activeTaskCount)", build)

        start = self.source.index("private void UpdatePortalActiveDownloadLayout(int taskCount)")
        end = self.source.index("private Point CaptureContentScroll()", start)
        layout = self.source[start:end]
        self.assertIn("DownloadTaskListHeight(activeDownloadsList.Padding, taskCount)", layout)
        self.assertIn("history.Top = listTop;", layout)
        self.assertIn("history.Height = Math.Max(190, panel.ClientSize.Height - listTop - 18);", layout)

    def test_portal_download_task_area_caps_visible_rows(self):
        start = self.source.index("private static int DownloadTaskListHeight(Padding padding, int taskCount)")
        end = self.source.index("private Vst76InlineDownloadProgress", start)
        helper = self.source[start:end]
        self.assertIn("Math.Min(MaxVisibleDownloadTaskRows, Math.Max(1, taskCount))", helper)
        self.assertIn("visibleRows * (DownloadTaskRowHeight + DownloadTaskRowGap)", helper)

    def test_portal_fitting_tasks_disable_inner_scroll_and_clear_scroll_range(self):
        start = self.source.index("private void RenderActiveDownloads()")
        end = self.source.index("private void RestoreActiveDownloadScroll", start)
        render = self.source[start:end]
        self.assertIn("if (portalVariant && tasks.Count <= MaxVisibleDownloadTaskRows) needsTaskScroll = false;", render)
        self.assertIn("activeDownloadsList.AutoScroll = needsTaskScroll;", render)
        self.assertIn("ResetPortalActiveDownloadScroll();", render)

        start = self.source.index("private void ResetPortalActiveDownloadScroll()")
        end = self.source.index("private Point CaptureContentScroll()", start)
        reset = self.source[start:end]
        self.assertLess(reset.index("activeDownloadsList.AutoScroll = true;"), reset.index("activeDownloadsList.AutoScrollPosition = Point.Empty;"))
        self.assertLess(reset.index("activeDownloadsList.AutoScrollPosition = Point.Empty;"), reset.index("activeDownloadsList.AutoScroll = false;"))
        self.assertIn("activeDownloadsList.AutoScrollMinSize = Size.Empty;", reset)

    def test_portal_task_render_clears_stale_inner_scroll_offset(self):
        start = self.source.index("private void RenderActiveDownloads()")
        end = self.source.index("private void RestoreActiveDownloadScroll", start)
        render = self.source[start:end]
        self.assertIn("if (portalVariant)", render)
        self.assertIn("activeDownloadsList.AutoScrollPosition = Point.Empty;", render)
        self.assertIn("scrollPosition = Point.Empty;", render)

    def test_config_sync_rebuilds_navigation_when_pages_change(self):
        start = self.source.index("private void ApplyConfig()")
        end = self.source.index("private void RefreshVisibleActionTargets()", start)
        apply_config = self.source[start:end]
        self.assertIn("String.Equals(NavigationSignature(), lastNavigationSignature", apply_config)
        self.assertIn("Only use the lightweight refresh when navigation", apply_config)

    def test_navigation_signature_includes_pages_and_toolbox_tabs(self):
        start = self.source.index("private string NavigationSignature()")
        end = self.source.index("private void RenderCurrentSections()", start)
        signature = self.source[start:end]
        self.assertIn('navConfig["pages"] = pageNavigation;', signature)
        self.assertIn('navConfig["toolboxTabs"] = toolboxNavigation;', signature)

    def test_original_variant_reflows_cards_after_initial_window_layout(self):
        self.assertIn("else if (!studioVariant && !tunerVariant && !audioVariant && !vst76Variant && !xingguiVariant)", self.source)
        self.assertIn("bool originalVariant = !portalVariant && !tunerVariant && !studioVariant && !audioVariant && !vst76Variant && !xingguiVariant;", self.source)
        self.assertIn("portalVariant || audioVariant || tunerVariant || vst76Variant || xingguiVariant || originalVariant", self.source)


if __name__ == "__main__":
    unittest.main()
