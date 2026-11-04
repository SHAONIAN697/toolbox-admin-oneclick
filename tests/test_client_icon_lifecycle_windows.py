"""Exercise delayed icons across real page, scroll, palette and home-page paths."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from tests.test_client_icon_refresh_winforms import find_csharp_compiler
from tests.test_client_variant_icon_windows import VARIANTS, fixture_source


LIFECYCLE_METHODS = r'''
        private readonly ManualResetEvent fixtureIconGate = new ManualResetEvent(true);

        private sealed class FixtureTree
        {
            public string Page;
            public List<Control> Controls;
            public List<IntPtr> Handles;
            public List<Point> Locations;
            public Point Scroll;
            public int Renders;
        }

        private void FixtureOpen()
        {
            fixtureProfile = 0;
            configApplied = true;
            config = new Dictionary<string, object> {
                { "app", new Dictionary<string, object> { { "title", "Icon lifecycle fixture" } } },
                { "features", new Dictionary<string, object> { { "software_catalog_enabled", false } } },
                { "pages", new Dictionary<string, object>() },
                { "sidebar", new List<object>() }
            };
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-1800, -1800);
            Show();
            FixturePump(220);
        }

        private void FixtureAddPage(string id, int count, string iconGroup)
        {
            List<object> buttons = new List<object>();
            for (int i = 0; i < count; i++) buttons.Add(new Dictionary<string, object> {
                { "id", id + "-" + i }, { "name", "Business " + i }, { "action", "link" },
                { "url", "https://example.invalid/action" },
                { "icon", iconGroup == null ? "" : "https://example.invalid/" + iconGroup + "/" + (i % 4) + ".png" }
            });
            AsDict(Get(config, "pages"))[id] = new Dictionary<string, object> {
                { "label", id }, { "sections", new List<object> {
                    new Dictionary<string, object> { { "title", id }, { "buttons", buttons } }
                } }
            };
            ((List<object>)config["sidebar"]).Add(new Dictionary<string, object> { { "id", id }, { "label", id } });
        }

        private FixtureTree FixtureCapture()
        {
            List<Control> controls = FixtureDescendants(content);
            return new FixtureTree {
                Page = currentPage,
                Controls = controls,
                Handles = controls.Select(c => c.Handle).ToList(),
                Locations = controls.Select(c => c.Location).ToList(),
                Scroll = CaptureContentScroll(),
                Renders = fixtureRenders
            };
        }

        private void FixtureRequireTree(FixtureTree tree, int expectedIcons)
        {
            List<Control> now = FixtureDescendants(content);
            if (currentPage != tree.Page) throw new Exception("Late callback changed the page");
            if (fixtureRenders != tree.Renders) throw new Exception("Late callback rebuilt the page: " + (fixtureRenders - tree.Renders));
            if (now.Count != tree.Controls.Count) throw new Exception("Late callback changed the control count");
            for (int i = 0; i < now.Count; i++)
            {
                if (!Object.ReferenceEquals(now[i], tree.Controls[i]) || now[i].IsDisposed || now[i].Handle != tree.Handles[i])
                    throw new Exception("Late callback changed control identity: " + i);
                if (now[i].Location != tree.Locations[i]) throw new Exception("Late callback changed control position: " + i);
            }
            if (CaptureContentScroll() != tree.Scroll) throw new Exception("Icon arrival changed scroll position");
            int displayed = now.Count(FixtureHasImage);
            if (displayed != expectedIcons) throw new Exception("Unexpected icon count: " + displayed + ", expected " + expectedIcons);
        }

        private void FixtureNavigate(string page)
        {
            QueueShowPage(page);
            FixturePump(90);
            if (currentPage != page) throw new Exception("Queued navigation did not reach " + page);
        }

        private void FixtureLog(string scenario, string detail)
        {
            Console.WriteLine("variant={0}, scenario={1}, {2}, fullRenders=0", Program.ClientVariant, scenario, detail);
        }

        public void RunPageSwitchFixture()
        {
            FixtureOpen();
            FixtureAddPage("fixture_a", 4, "switch");
            FixtureAddPage("fixture_b", 4, "switch");
            FixtureAddPage("fixture_plain", 4, null);
            currentPage = "fixture_a";
            BuildNav();
            FixturePump(90);
            List<Control> firstPage = FixtureDescendants(content);
            FixtureNavigate("fixture_b");
            if (!firstPage.All(c => c.IsDisposed)) throw new Exception("Navigation left old controls alive");
            int pending;
            lock (iconCacheLock) pending = buttonIconTargets.Count;
            if (pending != 4) throw new Exception("Same-URL in-flight requests were not shared: " + pending);
            FixtureTree second = FixtureCapture();
            FixturePump(1150);
            FixtureRequireTree(second, 4);
            FixtureNavigate("fixture_plain");
            FixtureTree plain = FixtureCapture();
            FixturePump(100);
            FixtureRequireTree(plain, 0);
            FixtureNavigate("fixture_a");
            lock (iconCacheLock) if (buttonIconTargets.Count != 0) throw new Exception("Cache hit launched more work");
            FixtureTree cached = FixtureCapture();
            FixturePump(200);
            FixtureRequireTree(cached, 4);
            FixtureLog("switch-and-cache", "oldControlsDisposed=True, pendingUrls=4, cachedIcons=4");
            Close();
        }

        public void RunUnrelatedPageFixture()
        {
            FixtureOpen();
            FixtureAddPage("fixture_slow", 4, "unrelated");
            FixtureAddPage("fixture_plain", 4, null);
            ShowPage("fixture_slow");
            FixturePump(90);
            FixtureNavigate("fixture_plain");
            FixtureTree tree = FixtureCapture();
            FixturePump(1150);
            FixtureRequireTree(tree, 0);
            lock (iconCacheLock) if (buttonIconTargets.Count != 0) throw new Exception("Detached targets stayed pending");
            FixtureLog("unrelated-page", "displayed=0, pendingUrls=0");
            Close();
        }

        public void RunScrollFixture()
        {
            FixtureOpen();
            Size = new Size(900, 600);
            fixtureIconGate.Reset();
            FixtureAddPage("fixture_scroll", 80, "scroll");
            ShowPage("fixture_scroll");
            FixturePump(500);
            if (contentResizeRenderPending) throw new Exception("Initial resize did not settle before scrolling");
            content.AutoScrollPosition = new Point(0, 120);
            FixturePump(60);
            FixtureTree tree = FixtureCapture();
            if (!content.AutoScroll || tree.Scroll.Y >= 0) throw new Exception("Fixture did not actually scroll");
            fixtureIconGate.Set();
            FixturePump(1150);
            FixtureRequireTree(tree, 80);
            FixtureLog("scroll", "icons=80, scrollBefore=" + tree.Scroll.Y + ", scrollAfter=" + CaptureContentScroll().Y);
            Close();
        }

        public void RunThemeFixture()
        {
            FixtureOpen();
            FixtureAddPage("fixture_theme", 4, "theme");
            ClientSettings settings = LoadClientSettings();
            settings.Theme = "light";
            SaveClientSettings(settings);
            ApplyTheme("银光素白");
            ApplyTemplatePalette();
            if (studioVariant) ApplyStudioThemeToShell();
            else if (tunerVariant || vst76Variant) ApplyTunerThemeToShell();
            currentPage = "fixture_theme";
            BuildNav();
            FixturePump(60);
            bool previousLight = LightTheme;
            if (studioVariant) ToggleStudioTheme();
            else if (tunerVariant || vst76Variant) ToggleTunerTheme();
            else
            {
                ApplyTheme("midnight");
                if (portalVariant) { ApplyTemplatePalette(); ApplyPortalThemeToShell(); }
                RenderCurrentVisiblePage();
            }
            FixturePump(200);
            if ((studioVariant || tunerVariant || vst76Variant) && LightTheme == previousLight)
                throw new Exception("Theme toggle did not actually change light/dark mode");
            FixtureTree tree = FixtureCapture();
            if (tree.Page != "fixture_theme") throw new Exception("Theme change changed the business route");
            Color expectedBack = content.BackColor;
            FixturePump(1150);
            FixtureRequireTree(tree, 4);
            if (content.BackColor != expectedBack) throw new Exception("Late icon changed the palette");
            FixtureLog("theme", "icons=4, lightBefore=" + previousLight + ", lightAfter=" + LightTheme);
            Close();
        }

        public void RunClosedWindowFixture()
        {
            FixtureOpen();
            FixtureAddPage("fixture_close", 4, "closed");
            ShowPage("fixture_close");
            FixturePump(60);
            int applications = fixtureApplications;
            List<Control> controls = FixtureDescendants(content);
            Close();
            FixturePump(1200);
            if (!IsDisposed || !controls.All(c => c.IsDisposed)) throw new Exception("Fixture window was not disposed");
            if (fixtureApplications != applications) throw new Exception("Callback attempted to apply after closing the form");
            lock (iconCacheLock) if (buttonIconTargets.Count != 0) throw new Exception("Closed form retained pending batches");
            FixtureLog("closed-window", "pendingUrls=0, lateApplications=0");
        }

        public void RunPortalWrapFixture(int count)
        {
            FixtureOpen();
            Size = MinimumSize;
            fixtureIconGate.Reset();
            FixtureAddPage("fixture_wrap", count, "wrap");
            ShowPage("fixture_wrap");
            FixturePump(500);
            if (contentResizeRenderPending) throw new Exception("Narrow-page resize did not settle");
            FixtureTree tree = FixtureCapture();
            List<TemplateActionButton> buttons = tree.Controls.OfType<TemplateActionButton>().ToList();
            int rows = buttons.Select(b => b.Top).Distinct().Count();
            if (buttons.Count != count || rows != (count == 3 ? 1 : 2))
                throw new Exception("Expected a three-column wrap boundary: count=" + count + ", rows=" + rows);
            FixtureSaveContent("wrap-" + count + "-before-icons");
            fixtureIconGate.Set();
            FixturePump(1250);
            FixtureRequireTree(tree, count);
            FixtureSaveContent("wrap-" + count + "-after-icons");
            FixtureLog("wrap-" + count, "rows=" + rows + ", columns=3");
            Close();
        }

        public void RunXingguiHomeFixture(int count)
        {
            FixtureOpen();
            Size = new Size(1400, 1100);
            FixtureAddPage("fixture_other", 4, null);
            List<object> homeButtons = new List<object>();
            for (int i = 0; i < count; i++) homeButtons.Add(new Dictionary<string, object> {
                { "id", "home-" + i }, { "name", "Home " + i }, { "action", "link" },
                { "url", "https://example.invalid/action" }, { "icon", "https://example.invalid/home/" + i + ".png" }
            });
            AsDict(Get(config, "pages"))[XingguiHomePageId] = new Dictionary<string, object> {
                { "label", "Home" }, { "sections", new List<object> {
                    new Dictionary<string, object> { { "title", "Remote" }, { "buttons", homeButtons } },
                    new Dictionary<string, object> { { "title", "Business" }, { "buttons", homeButtons } }
                } }
            };
            ShowPage(XingguiHomePageId);
            FixturePump(200);
            FixtureTree tree = FixtureCapture();
            FixturePump(1250);
            FixtureRequireTree(tree, count * 2);
            Size = new Size(900, 650);
            FixturePump(250);
            List<Button> nextButtons = FixtureDescendants(content).OfType<Button>().Where(b => b.Text == "下一组" && b.Enabled).ToList();
            if (nextButtons.Count == 0) throw new Exception("Narrow home fixture did not paginate");
            nextButtons[0].PerformClick();
            FixturePump(200);
            FixtureTree paged = FixtureCapture();
            int visibleIcons = paged.Controls.Count(FixtureHasImage);
            if (visibleIcons == 0) throw new Exception("Home pagination lost its icons");
            FixturePump(450);
            FixtureRequireTree(paged, visibleIcons);
            if (xingguiLeftPage + xingguiRightPage <= 0) throw new Exception("Home pager did not advance");
            FixtureNavigate("fixture_other");
            FixtureNavigate(XingguiHomePageId);
            FixtureTree returned = FixtureCapture();
            FixturePump(250);
            FixtureRequireTree(returned, returned.Controls.Count(FixtureHasImage));
            FixtureLog("xinggui-home-" + count, "wideIcons=" + (count * 2) + ", pagerAdvanced=True");
            Close();
        }
'''


LIFECYCLE_RUNNER = r'''
internal static class LifecycleRunner
{
    [STAThread]
    private static int Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        List<Exception> errors = new List<Exception>();
        Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs args) { errors.Add(args.Exception); };
        Func<ToolboxClient.ToolboxForm> create = delegate { return new ToolboxClient.ToolboxForm("https://example.invalid/api/toolbox/config?key=" + ToolboxClient.Program.ClientVariant); };
        try
        {
            using (var form = create()) form.RunPageSwitchFixture();
            using (var form = create()) form.RunUnrelatedPageFixture();
            using (var form = create()) form.RunScrollFixture();
            using (var form = create()) form.RunThemeFixture();
            using (var form = create()) form.RunClosedWindowFixture();
            if (ToolboxClient.Program.ClientVariant == "portal")
                for (int count = 3; count <= 5; count++)
                    using (var form = create()) form.RunPortalWrapFixture(count);
            if (ToolboxClient.Program.ClientVariant == "xinggui")
                for (int count = 3; count <= 5; count++)
                    using (var form = create()) form.RunXingguiHomeFixture(count);
            if (errors.Count > 0) throw new Exception("Unhandled UI errors: " + errors[0]);
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}
'''


def lifecycle_source(variant):
    source = fixture_source(variant, extra_methods=LIFECYCLE_METHODS, runner=LIFECYCLE_RUNNER)
    source = source.replace(
        'string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ToolboxClient");',
        'string appDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "fixture-client-data");',
    )
    source = source.replace(
        "private void RenderXingguiHomePage()\n        {",
        "private void RenderXingguiHomePage()\n        {\n            fixtureRenders++;",
    )
    source = source.replace(
        "Thread.Sleep(450 + ((fixtureProfile == 0 ? index : 4 - index) * 140));",
        "fixtureIconGate.WaitOne(); Thread.Sleep(450 + ((fixtureProfile == 0 ? index : 4 - index) * 140));",
    )
    return source


class ClientIconLifecycleWindowTests(unittest.TestCase):
    def test_all_variants_preserve_icon_lifecycle_and_navigation(self):
        if os.name != "nt":
            self.skipTest("Windows desktop required")
        compiler = find_csharp_compiler()
        if not compiler:
            self.skipTest("C# compiler required")
        with tempfile.TemporaryDirectory() as temp:
            for variant in VARIANTS:
                with self.subTest(variant=variant):
                    source = Path(temp) / (variant + "-lifecycle.cs")
                    exe = source.with_suffix(".exe")
                    source.write_text(lifecycle_source(variant), encoding="utf-8-sig")
                    args = [compiler, "-codepage:65001", "-target:exe", "-main:LifecycleRunner", "-out:" + str(exe)]
                    args += ["-r:" + name + ".dll" for name in ("System", "System.Core", "System.Windows.Forms", "System.Drawing", "System.Web.Extensions", "System.IO.Compression", "System.IO.Compression.FileSystem")]
                    compiled = subprocess.run(args + [str(source)], capture_output=True, text=True, errors="replace", timeout=60)
                    self.assertEqual(0, compiled.returncode, compiled.stdout + compiled.stderr)
                    result = subprocess.run([str(exe)], capture_output=True, text=True, errors="replace", timeout=45)
                    self.assertEqual(0, result.returncode, result.stdout + result.stderr)
                    self.assertEqual(8 if variant in ("portal", "xinggui") else 5, result.stdout.count("fullRenders=0"), result.stdout)
                    print(result.stdout, end="", flush=True)


if __name__ == "__main__":
    unittest.main()
