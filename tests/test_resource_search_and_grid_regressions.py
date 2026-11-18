import os
import shutil
import subprocess
import tempfile
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

    def test_search_result_dispatches_cloud_resolver_as_a_dedicated_action(self):
        start = self.source.index("private void ExecuteResourceSearchResult(ResourceSearchEntry entry)")
        end = self.source.index("private void RunResourceItemAction(", start)
        method = self.source[start:end]
        self.assertIn('if (action == "cloud_resolve_download")', method)
        self.assertIn('StartCloudResolverButtonDownload(GetText(entry.Item, "id", ""), entry.Name);', method)
        self.assertLess(method.index('if (action == "cloud_resolve_download")'), method.index("RunAction("))
        self.assertIn('MessageBox.Show(', method)
    def test_cloud_resolver_post_has_upstream_timeout_budget(self):
        start = self.source.index("private string PostJson(string url, string json)")
        end = self.source.index("private static string CurrentExecutableSha256", start)
        method = self.source[start:end]
        self.assertIn("request.Timeout = cloudResolverRequest ? 45000 : 10000;", method)
        self.assertIn("request.ReadWriteTimeout = cloudResolverRequest ? 45000 : 10000;", method)
        self.assertIn('if (cloudResolverRequest)', method)
    def test_xinggui_empty_target_guard_allows_cloud_resolver_action(self):
        start = self.source.index("private void RunResourceItemAction(Dictionary<string, object> item, ActionInfo info)")
        end = self.source.index("private void StartCloudResolverButtonDownload(", start)
        method = self.source[start:end]
        self.assertIn('info.Action != "cloud_resolve_download"', method)
        self.assertLess(method.index('info.Action != "cloud_resolve_download"'), method.index('if (info.Action == "cloud_resolve_download")'))
        self.assertIn('StartCloudResolverButtonDownload(info.ItemId, info.Name);', method)
    def test_grid_scroll_reserves_bottom_space_for_last_row(self):
        self.assertIn("content.PerformLayout();", self.source)
        self.assertIn("int requiredScrollBottom = requiredBottom + bottomPadding;", self.source)
        self.assertIn("Size desiredMinSize = new Size(0, requiredScrollBottom);", self.source)
        self.assertIn("content.HorizontalScroll.Enabled = false;", self.source)

    @unittest.skipUnless(os.name == "nt", "WinForms runtime regression requires Windows")
    def test_many_buttons_can_scroll_last_row_into_view(self):
        windows = Path(os.environ.get("WINDIR", r"C:\Windows"))
        compiler = shutil.which("csc") or next((str(path) for path in (
            windows / "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
            windows / "Microsoft.NET/Framework/v4.0.30319/csc.exe",
        ) if path.exists()), None)
        if not compiler:
            self.skipTest("C# compiler is not installed")

        start = self.source.index("private void UpdateContentScrolling()")
        end = self.source.index("private void BuildResourceSearchChrome()", start)
        method = self.source[start:end].strip().replace("private void UpdateContentScrolling()", "public void UpdateContentScrolling()", 1)
        harness = r'''using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
class ScrollHarness : Form {
    public FlowLayoutPanel content;
    bool audioVariant = false;
    bool portalVariant = false, tunerVariant = false, studioVariant = false, vst76Variant = false, xingguiVariant = false;
    List<object> currentSections = new List<object>();
    string currentPage = "buttons";
    Dictionary<string, object> config = new Dictionary<string, object>();
    int contentResizeCount = 0;
    public ScrollHarness() {
        ClientSize = new Size(820, 300);
        content = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = false,
            FlowDirection = FlowDirection.LeftToRight, WrapContents = true,
            Padding = new Padding(0, 28, 0, 0) };
        content.Resize += delegate { contentResizeCount++; };
        Controls.Add(content);
        for (int i = 0; i < 28; i++) content.Controls.Add(new Button {
            Text = "Button " + i, Width = 158, Height = 52,
            Margin = new Padding(0, 0, 12, 12) });
    }
    static Dictionary<string, object> AsDict(object value) { return value as Dictionary<string, object> ?? new Dictionary<string, object>(); }
    static object Get(Dictionary<string, object> value, string key) { object result; return value.TryGetValue(key, out result) ? result : null; }
    void DisableHorizontalScrollbars(Control control) { }
    __UPDATE_SCROLLING__
    public void Verify() {
        Show(); Application.DoEvents(); UpdateContentScrolling(); Application.DoEvents();
        content.AutoScrollPosition = new Point(0, content.VerticalScroll.Maximum);
        Application.DoEvents();
        Control last = content.Controls[content.Controls.Count - 1];
        if (!content.VerticalScroll.Visible || content.AutoScrollPosition.Y >= 0 || last.Bottom > content.ClientSize.Height)
            throw new Exception("Last button is outside the scrollable viewport: bottom=" + last.Bottom + ", viewport=" + content.ClientSize.Height + ", scroll=" + content.AutoScrollPosition.Y);
        bool lastButtonClicked = false;
        last.Click += delegate { lastButtonClicked = true; };
        ((Button)last).PerformClick();
        if (!lastButtonClicked) throw new Exception("Last button is not clickable after scrolling");
        int settledResizeCount = contentResizeCount;
        for (int i = 0; i < 20; i++) UpdateContentScrolling();
        Application.DoEvents();
        if (contentResizeCount > settledResizeCount)
            throw new Exception("Repeated scroll measurement kept resizing the content panel");
        content.Controls.Clear();
        for (int i = 0; i < 6; i++) content.Controls.Add(new Button {
            Text = "Short " + i, Width = 158, Height = 52,
            Margin = new Padding(0, 0, 12, 12) });
        currentPage = "settings";
        UpdateContentScrolling(); Application.DoEvents();
        if (content.VerticalScroll.Visible || content.AutoScrollMinSize != Size.Empty)
            throw new Exception("Short page retained the previous page's scroll extent");
        currentPage = "buttons";
        UpdateContentScrolling(); Application.DoEvents();
        if (!content.VerticalScroll.Visible || content.AutoScrollMinSize.Height <= content.ClientSize.Height)
            throw new Exception("Original button pages must keep a functional vertical scrollbar");
    }
    [STAThread] static void Main() { try { Application.EnableVisualStyles(); new ScrollHarness().Verify(); Console.WriteLine("last button reachable"); Console.Out.Flush(); Environment.Exit(0); } catch (Exception ex) { Console.Error.WriteLine(ex.Message); Console.Error.Flush(); Environment.Exit(1); } }
}'''.replace("__UPDATE_SCROLLING__", method)

        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "ScrollHarness.cs"
            executable = Path(temp) / "ScrollHarness.exe"
            source.write_text(harness, encoding="utf-8")
            compile_result = subprocess.run([
                compiler, "-nologo", "-target:exe", f"-out:{executable}",
                "-r:System.dll", "-r:System.Core.dll", "-r:System.Windows.Forms.dll",
                "-r:System.Drawing.dll", str(source),
            ], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
            self.assertEqual(0, compile_result.returncode, compile_result.stderr or compile_result.stdout)
            run_result = subprocess.run([str(executable)], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)
            self.assertIn("last button reachable", run_result.stdout)
            self.assertIn(run_result.returncode, (0, 0xC000041D), run_result.stderr or run_result.stdout)


if __name__ == "__main__":
    unittest.main()
