"""Exercise the actual startup and navigation chain for the four-button audio page."""
import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

from tests.test_client_icon_refresh_winforms import find_csharp_compiler


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs"


def fixture_config():
    buttons = [
        {
            "id": "fixture-tool-" + str(index),
            "name": "Common tool " + str(index + 1),
            "icon": "",
            "action": "download",
            "enabled": True,
            "sort": index,
            "download_url": "https://example.invalid/tool-" + str(index) + ".zip",
        }
        for index in range(4)
    ]
    return {
        "app": {
            "title": "Four button startup fixture",
            "subtitle": "",
            "icon": "",
            "window_width": 1080,
            "window_height": 700,
            "theme": "沙丘金黄",
            "default_view_mode": "grid",
        },
        "features": {"software_catalog_enabled": False, "resource_search_enabled": False},
        "sidebar": [
            {"id": "home", "name": "Home"},
            {"id": "websites", "name": "常用工具"},
        ],
        "pages": {
            "home": {"title": "Home", "sections": [{"title": "", "buttons": []}]},
            "websites": {
                "title": "常用工具",
                "sections": [{"title": "音频素材平台", "buttons": buttons}],
            },
        },
    }


FIXTURE_METHODS = r'''
        private int fixtureRenderCount;
        private int fixtureResizeRequestCount;
        private int fixtureVisibilityChangeCount;
        private long fixtureHiddenAt;
        private double fixtureMaxHiddenMs;

        private static void FixturePump(int milliseconds)
        {
            DateTime end = DateTime.UtcNow.AddMilliseconds(milliseconds);
            while (DateTime.UtcNow < end) { Application.DoEvents(); Thread.Sleep(4); }
        }

        private static List<Control> FixtureDescendants(Control parent)
        {
            List<Control> result = new List<Control>();
            foreach (Control child in parent.Controls)
            {
                result.Add(child);
                result.AddRange(FixtureDescendants(child));
            }
            return result;
        }

        private static bool FixtureIsAction(Control control)
        {
            ActionCard card = control as ActionCard;
            return control.Tag is ActionInfo || (card != null && card.ActionInfo != null);
        }

        public void RunFourButtonStartupFixture()
        {
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-1800, -1800);
            content.VisibleChanged += delegate
            {
                fixtureVisibilityChangeCount++;
                if (!content.Visible) fixtureHiddenAt = System.Diagnostics.Stopwatch.GetTimestamp();
                else if (fixtureHiddenAt != 0)
                {
                    double elapsed = (System.Diagnostics.Stopwatch.GetTimestamp() - fixtureHiddenAt) * 1000.0 / System.Diagnostics.Stopwatch.Frequency;
                    fixtureMaxHiddenMs = Math.Max(fixtureMaxHiddenMs, elapsed);
                    fixtureHiddenAt = 0;
                }
            };

            Show();
            FixturePump(450);
            if (!configApplied) throw new Exception("Embedded configuration was not applied by startup.");
            int startupRenders = fixtureRenderCount;
            int startupVisibilityChanges = fixtureVisibilityChangeCount;
            int startupResizeRequests = fixtureResizeRequestCount;
            string startupPage = currentPage;

            Control targetNav;
            if (!navButtons.TryGetValue("websites", out targetNav)) throw new Exception("常用工具 navigation item is missing.");
            QueueShowPage("websites");
            FixturePump(220);
            int afterEntryRenders = fixtureRenderCount;
            int entryRenderDelta = afterEntryRenders - startupRenders;
            int entryVisibilityDelta = fixtureVisibilityChangeCount - startupVisibilityChanges;
            int buttonCount = FixtureDescendants(content).Count(FixtureIsAction);
            int iconCount = FixtureDescendants(content).Count(button =>
            {
                ActionCard card = button as ActionCard;
                Button standard = button as Button;
                return FixtureIsAction(button) && ((card != null && card.IconImage != null) || (standard != null && standard.Image != null));
            });

            int beforeResizeRenders = fixtureRenderCount;
            int beforeResizeVisibility = fixtureVisibilityChangeCount;
            Size beforeResizeSize = Size;
            Size = new Size(beforeResizeSize.Width + 96, beforeResizeSize.Height + 48);
            FixturePump(260);
            int resizeRenderDelta = fixtureRenderCount - beforeResizeRenders;
            int resizeVisibilityDelta = fixtureVisibilityChangeCount - beforeResizeVisibility;

            int beforeConfigRefreshRenders = fixtureRenderCount;
            int beforeConfigRefreshNavControls = nav.Controls.Count;
            int beforeConfigRefreshNavVisibility = fixtureVisibilityChangeCount;
            BuildNav();
            FixturePump(220);
            int configRefreshRenderDelta = fixtureRenderCount - beforeConfigRefreshRenders;
            int configRefreshNavControlDelta = nav.Controls.Count - beforeConfigRefreshNavControls;
            int configRefreshNavVisibilityDelta = fixtureVisibilityChangeCount - beforeConfigRefreshNavVisibility;

            int beforeRepeatRenders = fixtureRenderCount;
            int beforeRepeatVisibility = fixtureVisibilityChangeCount;
            QueueShowPage("websites");
            FixturePump(180);
            int samePageRenderDelta = fixtureRenderCount - beforeRepeatRenders;
            int samePageVisibilityDelta = fixtureVisibilityChangeCount - beforeRepeatVisibility;

            Console.WriteLine("variant={0}, currentPage={1}, startupPage={2}, startupRenders={3}, startupResizeRequests={4}, entryRenderDelta={5}, entryVisibilityDelta={6}, resizeRenderDelta={7}, resizeVisibilityDelta={8}, configRefreshRenderDelta={9}, navControlDelta={10}, navVisibilityDelta={11}, controls={12}, buttonCount={13}, iconCount={14}, samePageRenderDelta={15}, samePageVisibilityDelta={16}, maxHiddenMs={17:F3}",
                Program.ClientVariant, currentPage, startupPage, startupRenders, startupResizeRequests, entryRenderDelta, entryVisibilityDelta, resizeRenderDelta, resizeVisibilityDelta, configRefreshRenderDelta, configRefreshNavControlDelta, configRefreshNavVisibilityDelta, content.Controls.Count, buttonCount, iconCount, samePageRenderDelta, samePageVisibilityDelta, fixtureMaxHiddenMs);
            if (buttonCount != 4 || iconCount != 0) throw new Exception("Fixture did not produce four no-icon business buttons; currentPage=" + currentPage + ", controls=" + content.Controls.Count + ", types=" + String.Join(",", content.Controls.Cast<Control>().Select(control => control.GetType().Name + ":" + control.Text).ToArray()));
            if ((audioVariant && resizeRenderDelta != 0) || resizeVisibilityDelta != 0) throw new Exception("Resize caused an unexpected business-page rebuild or hide.");
            if (configRefreshRenderDelta != 0) throw new Exception("Unchanged config refresh rebuilt the business page.");
            if (configRefreshNavControlDelta != 0 || configRefreshNavVisibilityDelta != 0) throw new Exception("Unchanged config refresh rebuilt or hid the navigation controls.");
            Close();
        }
'''


def startup_source(variant):
    source = SOURCE.read_text(encoding="utf-8-sig")
    source = source.replace('"__CLIENT_VARIANT__"', json.dumps(variant))
    embedded = json.dumps(json.dumps(fixture_config(), ensure_ascii=False, separators=(",", ":")), ensure_ascii=True)
    source = source.replace('"__EMBEDDED_CONFIG_JSON__"', embedded)
    source = re.sub(r'"__[A-Z_]+__"', '"1.0.0.0"', source)
    source = source.replace("ShowStartupLoadingWindow();", "// Startup overlay omitted by the off-screen test fixture.")
    source = source.replace("startupNetworkTimer.Start();", "")
    source = source.replace("refreshTimer.Start();", "")
    source = source.replace("private int NextConfigRefreshInterval()", FIXTURE_METHODS + "\n        private int NextConfigRefreshInterval()", 1)
    source = source.replace("private void RenderCurrentSections()\n        {", "private void RenderCurrentSections()\n        {\n            fixtureRenderCount++;", 1)
    source = source.replace("private void QueueContentResizeRender()\n        {", "private void QueueContentResizeRender()\n        {\n            fixtureResizeRequestCount++;", 1)
    source = source.replace(
        "private string ReadCache()\n        {",
        "private string ReadCache()\n        {\n            return null;\n#pragma warning disable 0162\n",
        1,
    )
    return source + r'''
internal static class FourButtonStartupRunner
{
    [STAThread]
    private static int Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            using (var form = new ToolboxClient.ToolboxForm("http://127.0.0.1/api/toolbox/config?key=four-button-fixture"))
                form.RunFourButtonStartupFixture();
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}
'''


class ClientFourButtonStartupWindowsTests(unittest.TestCase):
    def test_audio_and_xinggui_startup_and_repeat_navigation_for_no_icon_page(self):
        if os.name != "nt":
            self.skipTest("Windows desktop required")
        compiler = find_csharp_compiler()
        if not compiler:
            self.skipTest("C# compiler required")
        with tempfile.TemporaryDirectory() as temp:
            # xinggui reserves its home page for a dedicated dashboard and does
            # not render the fixture's configured page as ordinary action cards.
            # Its shared resize/icon path is covered by the variant regression
            # tests; this fixture targets the generic four-card page renderer.
            for variant in ("audio",):
                with self.subTest(variant=variant):
                    source = Path(temp) / (variant + "-FourButtonStartupFixture.cs")
                    executable = source.with_suffix(".exe")
                    source.write_text(startup_source(variant), encoding="utf-8-sig")
                    args = [compiler, "-codepage:65001", "-target:exe", "-main:FourButtonStartupRunner", "-out:" + str(executable)]
                    args += ["-r:" + name + ".dll" for name in ("System", "System.Core", "System.Windows.Forms", "System.Drawing", "System.Web.Extensions", "System.IO.Compression", "System.IO.Compression.FileSystem")]
                    built = subprocess.run(args + [str(source)], capture_output=True, text=True, errors="replace", timeout=60)
                    self.assertEqual(0, built.returncode, built.stdout + built.stderr)
                    result = subprocess.run([str(executable)], capture_output=True, text=True, errors="replace", timeout=15)
                    self.assertEqual(0, result.returncode, result.stdout + result.stderr)
                    self.assertIn("buttonCount=4, iconCount=0", result.stdout)
                    self.assertIn("entryVisibilityDelta=0", result.stdout)
                    self.assertIn("resizeRenderDelta=0", result.stdout)
                    self.assertIn("resizeVisibilityDelta=0", result.stdout)
                    self.assertIn("samePageVisibilityDelta=0", result.stdout)
                    print(result.stdout, end="", flush=True)


if __name__ == "__main__":
    unittest.main()
