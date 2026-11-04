import unittest
from pathlib import Path


CLIENT_SOURCE = (
    Path(__file__).parents[1]
    / "src"
    / "ToolboxAdminApi-oneclick"
    / "client-template"
    / "ToolboxClient.cs"
)


class ResourceSearchAndGridRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = CLIENT_SOURCE.read_text(encoding="utf-8")
        cls.admin_source = (CLIENT_SOURCE.parents[1] / "wwwroot" / "admin.js").read_text(encoding="utf-8")

    def test_all_client_variants_use_the_admin_search_switch(self):
        self.assertIn(
            'return BoolValue(features, "resource_search_enabled", false);',
            self.source,
        )
        self.assertIn("if (resourceSearchButtonHost == null) return;", self.source)
        self.assertNotIn("resourceSearchButtonHost == null || vst76Variant", self.source)

    def test_audio_shell_exposes_a_search_button_host(self):
        self.assertIn("Dock = DockStyle.Right, Width = 294, Height = 42", self.source)
        self.assertIn("titleBar.Controls.Add(chrome);\n            resourceSearchButtonHost = chrome;\n            downloadTasksButton", self.source)

    def test_audio_window_controls_are_anchored_at_the_right_edge(self):
        shell = self.source[self.source.index("private void BuildAudioShell()"):self.source.index("private Button MakeAudioChromeButton")]
        self.assertIn("FlowDirection = FlowDirection.RightToLeft", shell)
        ordered_controls = ["chrome.Controls.Add(closeButton);", "chrome.Controls.Add(maxButton);", "chrome.Controls.Add(minButton);", "chrome.Controls.Add(topMostButton);"]
        positions = [shell.index(control) for control in ordered_controls]
        self.assertEqual(sorted(positions), positions)
        search = self.source[self.source.index("private void AddResourceSearchButtonToChrome()"):self.source.index("private void LayoutAudioWindowChrome()")]
        self.assertIn("resourceSearchButtonHost.Controls.Add(resourceSearchButton);", search)
        self.assertIn("resourceSearchButtonHost.Controls.SetChildIndex(resourceSearchButton, 3);", search)
        self.assertIn("return;", search)
        layout = self.source[self.source.index("private void LayoutAudioWindowChrome()"):self.source.index("private void LayoutResourceSearchChrome()")]
        self.assertIn("titleBar.ClientSize.Width - 14", layout)
        self.assertIn("chrome.Width = targetWidth;", layout)
        self.assertIn("control.Width = regularButtonWidth;", layout)

    def test_portal_window_and_cards_adapt_to_work_area_and_resize(self):
        portal = self.source[self.source.index("private void BuildPortalShell()"):self.source.index("private void AttachBrandPopupEntry")]
        self.assertIn("Rectangle portalWorkArea = Screen.FromControl(this).WorkingArea;", portal)
        self.assertIn("portalWorkArea.Width - 24", portal)
        self.assertIn("content.HorizontalScroll.Enabled = false;", portal)
        shown = self.source[self.source.index("Shown += delegate"):self.source.index("private int NextConfigRefreshInterval()")]
        self.assertIn("Rectangle workArea = Screen.FromControl(this).WorkingArea;", shown)
        self.assertIn("Location = new Point(workArea.Left + (workArea.Width - width) / 2", shown)
        cards = self.source[self.source.index("private void RenderPortalSections()"):self.source.index("private void RenderPortalLoadingState")]
        self.assertIn("WrapContents = true", cards)
        self.assertIn("AutoScroll = false", cards)
        self.assertIn("cards.HorizontalScroll.Enabled = false;", cards)
        section_cards = self.source[self.source.index("private Control CreatePortalCardsPanel"):self.source.index("private Control CreatePortalEmptyGroup")]
        self.assertIn("cards.HorizontalScroll.Enabled = false;", section_cards)
        self.assertIn("WrapContents = true", section_cards)
        resize = self.source[self.source.index("protected override void OnResize(EventArgs e)"):self.source.index("protected override void OnDeactivate")]
        self.assertIn("if ((portalVariant || currentPage.Equals(SoftwareCatalogPageId", resize)
        self.assertIn("QueueContentResizeRender();", resize)
        width = self.source[self.source.index("private int PortalContentWidth()"):self.source.index("private static int PortalGridColumnCount")]
        self.assertIn("int shellWidth = ClientSize.Width - 236 - 26 - 32 - 4;", width)
        self.assertIn("Math.Min(panelWidth, shellWidth)", width)
        scroll = self.source[self.source.index("private void UpdateContentScrolling()"):self.source.index("private void BuildResourceSearchChrome()")]
        self.assertIn("Size desiredMinSize = new Size(0, requiredScrollBottom);", scroll)
        self.assertIn("content.HorizontalScroll.Enabled = false;", scroll)
        download = self.source[self.source.index("private void BuildPortalDownloadTable"):self.source.index("private void AttachDownloadRecordContextMenu")]
        self.assertIn("WrapContents = true", download)
        columns = self.source[self.source.index("private void ResizeDownloadRecordColumns()"):self.source.index("private static Color DialogBodyBack()")]
        self.assertIn("if (portalVariant && IsPortalDownloadRecordsList(recordsList))", columns)
        self.assertIn("int usable = Math.Max(4, width - 4);", columns)

    def test_resource_search_input_has_no_outer_border(self):
        self.assertIn("resourceSearchHost.Padding = Padding.Empty;", self.source)
        self.assertNotIn("PaintResourceSearchBorder", self.source)

    def test_resource_search_button_has_no_outer_border(self):
        self.assertIn("if (searchGlyph != null) searchGlyph.BorderColor = Color.Transparent;", self.source)

    def test_resource_search_is_admin_controlled_in_server_defaults(self):
        server_source = (CLIENT_SOURCE.parents[1] / "app.py").read_text(encoding="utf-8")
        self.assertIn('"resource_search_enabled": False', server_source)
        self.assertIn(
            'resource_search_enabled = config_bool(features.get("resource_search_enabled"), False)',
            server_source,
        )

    def test_powershell_client_builder_references_compression_assemblies(self):
        server_source = (CLIENT_SOURCE.parents[1] / "server.ps1").read_text(encoding="utf-8")
        self.assertIn('"/reference:System.IO.Compression.dll"', server_source)
        self.assertIn('"/reference:System.IO.Compression.FileSystem.dll"', server_source)

    def test_admin_panel_reads_and_saves_the_search_switch(self):
        self.assertIn('id="resourceSearchEnabled"', self.admin_source)
        self.assertIn("features.resource_search_enabled = $('resourceSearchEnabled')?.checked === true;", self.admin_source)

    def test_config_refresh_rebuilds_current_search_instead_of_resetting_page(self):
        self.assertIn("bool refreshCurrentSearchPage = resourceSearchActive", self.source)
        self.assertIn("if (resourceSearchActive && !refreshCurrentSearchPage)", self.source)
        self.assertIn("ExecuteResourceSearch();", self.source)

    def test_grid_scroll_reserves_bottom_space_for_last_row(self):
        self.assertIn("content.PerformLayout();", self.source)
        self.assertIn("int requiredScrollBottom = requiredBottom + bottomPadding;", self.source)
        self.assertIn("Size desiredMinSize = new Size(0, requiredScrollBottom);", self.source)
        self.assertIn("content.HorizontalScroll.Enabled = false;", self.source)


if __name__ == "__main__":
    unittest.main()
