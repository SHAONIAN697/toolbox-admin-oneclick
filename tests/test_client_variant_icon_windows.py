"""Run each full client template against deterministic icon IO on Windows.

Only the temporary test build replaces startup/network IO. Production controls,
shells, section renderers, resize handlers and icon completion methods run intact.
"""
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

from tests.test_client_icon_refresh_winforms import find_csharp_compiler


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs"
VARIANTS = ("original", "studio", "tuner", "audio", "portal", "vst76", "xinggui")


def fixture_source(variant, extra_methods="", runner=None):
    source = SOURCE.read_text(encoding="utf-8-sig")
    source = source.replace('"__CLIENT_VARIANT__"', '"' + variant + '"')
    source = re.sub(r'"__[A-Z_]+__"', '"1.0.0.0"', source)
    start = source.index("        public ToolboxForm(string url)")
    end = source.index("        private int NextConfigRefreshInterval()", start)
    source = source[:start] + '''
        public ToolboxForm(string url)
        {
            configUrl = url;
            FormBorderStyle = FormBorderStyle.None;
            MinimumSize = new Size(860, 560);
            Size = new Size(1080, 700);
            Font = new Font("Microsoft YaHei UI", 9F);
            DoubleBuffered = true;
            BuildShell();
        }
''' + source[end:]
    start = source.index("        private Image LoadRemoteImage(")
    end = source.index("        private string ResolveAssetUrl(string url)", start)
    source = source[:start] + '''
        private Image LoadRemoteImage(string url, int maxWidth, int maxHeight)
        {
            if (String.IsNullOrWhiteSpace(url)) return null;
            string key = maxWidth + "x" + maxHeight + "|" + url;
            lock (iconCacheLock) { Image cached; if (iconCache.TryGetValue(key, out cached)) return cached; }
            int index = Int32.Parse(Path.GetFileNameWithoutExtension(new Uri(url).AbsolutePath));
            Thread.Sleep(450 + ((fixtureProfile == 0 ? index : 4 - index) * 140));
            Bitmap image = new Bitmap(maxWidth, maxHeight);
            using (Graphics graphics = Graphics.FromImage(image)) graphics.Clear(Color.CornflowerBlue);
            lock (iconCacheLock) iconCache[key] = image;
            return image;
        }
''' + source[end:]
    source = source.replace("private void RenderCurrentSections()\n        {", "private void RenderCurrentSections()\n        {\n            fixtureRenders++;")
    source = source.replace("private void ApplyButtonIconImage(Control target, Image image)\n        {", "private void ApplyButtonIconImage(Control target, Image image)\n        {\n            fixtureApplications++;")
    source = source.replace("        private int NextConfigRefreshInterval()", FIXTURE_METHODS + extra_methods + "\n        private int NextConfigRefreshInterval()", 1)
    return source + (RUNNER if runner is None else runner)


FIXTURE_METHODS = r'''
        private int fixtureRenders;
        private int fixtureApplications;
        private int fixtureProfile;

        private static void FixturePump(int ms)
        {
            DateTime end = DateTime.UtcNow.AddMilliseconds(ms);
            while (DateTime.UtcNow < end) { Application.DoEvents(); Thread.Sleep(5); }
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

        private static bool FixtureHasImage(Control target)
        {
            FieldInfo field = target.GetType().GetField("IconImage");
            if (field != null) return field.GetValue(target) != null;
            Button button = target as Button;
            PictureBox picture = target as PictureBox;
            return (button != null && button.Image != null) || (picture != null && picture.Image != null);
        }

        private void FixtureSaveContent(string phase)
        {
            string directory = Environment.GetEnvironmentVariable("TOOLBOX_ICON_SNAPSHOT_DIR");
            if (String.IsNullOrWhiteSpace(directory)) return;
            Directory.CreateDirectory(directory);
            using (Bitmap snapshot = new Bitmap(content.Width, content.Height))
            {
                content.DrawToBitmap(snapshot, new Rectangle(Point.Empty, content.Size));
                snapshot.Save(Path.Combine(directory, Program.ClientVariant + "-" + phase + ".png"), System.Drawing.Imaging.ImageFormat.Png);
            }
        }

        public void RunIconFixture(int count, bool icons, int profile)
        {
            fixtureProfile = profile;
            configApplied = true;
            currentPage = "fixture_business";
            config = new Dictionary<string, object> {
                { "app", new Dictionary<string, object> { { "title", "Fixture" } } },
                { "pages", new Dictionary<string, object> { { currentPage, new Dictionary<string, object> { { "title", "Business" } } } } }
            };
            List<object> buttons = new List<object>();
            for (int i = 0; i < count; i++) buttons.Add(new Dictionary<string, object> {
                { "id", "fixture-" + i }, { "name", "Business " + i }, { "action", "url" },
                { "url", "https://example.invalid/action" },
                { "icon", icons ? "https://example.invalid/icons/" + i + ".png" : "" }
            });
            currentSections = new List<object> { new Dictionary<string, object> { { "title", "Business" }, { "buttons", buttons } } };
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-1600, -1600);
            Show();
            FixturePump(220);
            RenderCurrentSections();
            FixturePump(200);
            List<Control> before = FixtureDescendants(content);
            List<Point> positions = before.Select(c => c.Location).ToList();
            List<IntPtr> handles = before.Select(c => c.Handle).ToList();
            int renderCount = fixtureRenders;
            int resizeEvents = 0;
            content.SizeChanged += delegate { resizeEvents++; };
            if (count == 4 && icons && profile == 0) FixtureSaveContent("before-icons");
            FixturePump(1150);
            List<Control> after = FixtureDescendants(content);
            if (fixtureRenders != renderCount) throw new Exception("Repeated full render: " + (fixtureRenders - renderCount));
            if (before.Count != after.Count) throw new Exception("Control count changed");
            for (int i = 0; i < before.Count; i++)
            {
                if (!Object.ReferenceEquals(before[i], after[i]) || before[i].IsDisposed || before[i].Handle != handles[i])
                    throw new Exception("Control identity changed: " + i);
                if (before[i].Location != positions[i]) throw new Exception("Control moved: " + i);
            }
            int displayed = after.Count(FixtureHasImage);
            if (icons && (displayed < count || fixtureApplications < count))
                throw new Exception("Missing icons: expected=" + count + ", displayed=" + displayed + ", applied=" + fixtureApplications);
            if (count == 4 && icons && profile == 0) FixtureSaveContent("after-icons");
            Console.WriteLine("variant={0}, count={1}, icons={2}, profile={3}, displayed={4}, controls={5}, fullRenders=0, resizeEvents={6}",
                Program.ClientVariant, count, icons, profile, displayed, before.Count, resizeEvents);
            Close();
        }
'''

RUNNER = r'''
internal static class FixtureRunner
{
    [System.STAThread]
    private static int Main()
    {
        System.Windows.Forms.Application.EnableVisualStyles();
        System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
        for (int count = 3; count <= 5; count++)
        {
            for (int profile = 0; profile < 2; profile++)
            {
                using (var form = new ToolboxClient.ToolboxForm("https://example.invalid/api/toolbox/config?key=fixture"))
                    form.RunIconFixture(count, true, profile);
            }
            using (var form = new ToolboxClient.ToolboxForm("https://example.invalid/api/toolbox/config?key=fixture"))
                form.RunIconFixture(count, false, 0);
        }
        return 0;
    }
}
'''


class ClientVariantIconWindowTests(unittest.TestCase):
    def test_all_variant_windows_keep_real_business_controls_stable(self):
        if os.name != "nt":
            self.skipTest("Windows desktop required")
        compiler = find_csharp_compiler()
        if not compiler:
            self.skipTest("C# compiler required")
        with tempfile.TemporaryDirectory() as temp:
            for variant in VARIANTS:
                with self.subTest(variant=variant):
                    source = Path(temp) / (variant + ".cs")
                    exe = source.with_suffix(".exe")
                    source.write_text(fixture_source(variant), encoding="utf-8-sig")
                    args = [compiler, "-codepage:65001", "-target:exe", "-main:FixtureRunner", "-out:" + str(exe)]
                    args += ["-r:" + name + ".dll" for name in ("System", "System.Core", "System.Windows.Forms", "System.Drawing", "System.Web.Extensions", "System.IO.Compression", "System.IO.Compression.FileSystem")]
                    compile_result = subprocess.run(args + [str(source)], capture_output=True, text=True, timeout=60)
                    self.assertEqual(0, compile_result.returncode, compile_result.stdout + compile_result.stderr)
                    result = subprocess.run([str(exe)], capture_output=True, text=True, timeout=40)
                    self.assertEqual(0, result.returncode, result.stdout + result.stderr)
                    self.assertEqual(9, result.stdout.count("fullRenders=0"), result.stdout)
                    print(result.stdout, end="", flush=True)


if __name__ == "__main__":
    unittest.main()
