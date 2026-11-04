import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLIENT_SOURCE = ROOT / "src" / "ToolboxAdminApi-oneclick" / "client-template" / "ToolboxClient.cs"


def find_csharp_compiler():
    compiler = shutil.which("csc") or shutil.which("mcs")
    if compiler:
        return compiler
    windows_dir = Path(os.environ.get("WINDIR", r"C:\Windows"))
    for candidate in (
        windows_dir / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe",
        windows_dir / "Microsoft.NET" / "Framework" / "v4.0.30319" / "csc.exe",
    ):
        if candidate.exists():
            return str(candidate)
    return None


def extract_method(source, signature, end_marker):
    start = source.index(signature)
    end = source.index(end_marker, start)
    return source[start:end].strip()


class ClientIconRefreshWinFormsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.name != "nt":
            raise unittest.SkipTest("Real WinForms layout test requires Windows")
        cls.compiler = find_csharp_compiler()
        if not cls.compiler:
            raise unittest.SkipTest("No C# compiler installed")

        source = CLIENT_SOURCE.read_text(encoding="utf-8-sig")
        queue = extract_method(
            source,
            "private void QueueButtonIconLoad(string url, Control target, int size)",
            "private void ApplyButtonIconImage",
        ).replace("private void QueueButtonIconLoad(", "public void QueueButtonIconLoad(", 1)
        apply_icon = extract_method(
            source,
            "private void ApplyButtonIconImage(Control target, Image image)",
            "private Image LoadRemoteImage",
        )
        queue_resize = extract_method(
            source,
            "private void QueueContentResizeRender()",
            "private void EnsureContentResizeTimer()",
        )
        ensure_resize_timer = extract_method(
            source,
            "private void EnsureContentResizeTimer()",
            "private void RenderCurrentVisiblePage()",
        )

        cls.temp = tempfile.TemporaryDirectory()
        cls.exe = Path(cls.temp.name) / "ClientIconRefreshWinFormsTests.exe"
        harness = cls.build_harness(queue, apply_icon, queue_resize, ensure_resize_timer)
        source_file = Path(cls.temp.name) / "ClientIconRefreshWinFormsTests.cs"
        source_file.write_text(harness, encoding="utf-8-sig")
        args = [
            cls.compiler,
            "-codepage:65001",
            "-target:exe",
            f"-out:{cls.exe}",
            "-r:System.dll",
            "-r:System.Core.dll",
            "-r:System.Windows.Forms.dll",
            "-r:System.Drawing.dll",
            str(source_file),
        ]
        result = subprocess.run(args, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 or not cls.exe.exists():
            cls.temp.cleanup()
            raise RuntimeError("WinForms icon regression harness compilation failed:\n" + (result.stderr or result.stdout))

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "temp"):
            cls.temp.cleanup()

    @staticmethod
    def build_harness(queue_method, apply_method, resize_method, resize_timer_method):
        return r'''using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

namespace IconRefreshWinFormsTest
{
    public sealed class TemplateActionButton : Button
    {
        public Image IconImage { get { return Image; } set { Image = value; } }
    }
    public sealed class ActionCard : Button
    {
        public Image IconImage { get { return Image; } set { Image = value; } }
    }
    public sealed class TunerActionButton : Button
    {
        public Image IconImage { get { return Image; } set { Image = value; } }
    }

    public sealed class HarnessForm : Form
    {
        private readonly object iconCacheLock = new object();
        private readonly Dictionary<string, Image> iconCache = new Dictionary<string, Image>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, List<Control>> buttonIconTargets = new Dictionary<string, List<Control>>(StringComparer.Ordinal);
        private readonly Dictionary<string, int> loadDelays = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, int> loadCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        private readonly FlowLayoutPanel content;
        private readonly System.Windows.Forms.Timer probeTimer = new System.Windows.Forms.Timer();
        private readonly List<Control> targets = new List<Control>();
        private readonly List<IntPtr> originalHandles = new List<IntPtr>();
        private readonly List<Point> originalLocations = new List<Point>();
        private readonly int buttonCount;
        private readonly int profile;
        private readonly bool withIcons;
        private DateTime phaseStarted;
        private DateTime settleUntil;
        private int phase;
        private int added;
        private int removed;
        private int sizeChanged;
        private int fullPageRenders;
        private int applyCount;
        private bool contentResizeRenderPending;
        private string currentPage = "fixture";
        private const string TunerDriversPageId = "tuner_drivers";
        private const string TunerLinksPageId = "tuner_links";
        private string lastResizeRenderPage = "";
        private int lastResizeRenderWidth = -1;
        private int lastResizeRenderHeight = -1;
        private bool softwareCatalogLayoutUpdating;
        private bool contentRendering;
        private bool tunerVariant = true;
        private bool vst76Variant;
        private System.Windows.Forms.Timer contentResizeTimer;

        public Exception Failure;

        public HarnessForm(int count, int loadProfile, bool icons)
        {
            buttonCount = count;
            profile = loadProfile;
            withIcons = icons;
            ShowInTaskbar = false;
            Opacity = 0;
            StartPosition = FormStartPosition.Manual;
            Location = new Point(-1500, -1500);
            ClientSize = new Size(342, 196);
            content = new FlowLayoutPanel {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                WrapContents = true,
                FlowDirection = FlowDirection.LeftToRight,
                Padding = new Padding(4),
                Margin = Padding.Empty
            };
            Controls.Add(content);
            for (int i = 0; i < count; i++)
            {
                Control target = NewControl(i);
                target.Name = "button-" + i;
                target.Text = "Business " + i;
                target.Size = new Size(142, 70);
                target.Margin = new Padding(6);
                Button button = target as Button;
                if (button != null)
                {
                    button.ImageAlign = ContentAlignment.MiddleLeft;
                    button.TextImageRelation = TextImageRelation.ImageBeforeText;
                }
                targets.Add(target);
                content.Controls.Add(target);
            }
            Shown += delegate { probeTimer.Interval = 15; probeTimer.Tick += ProbeTick; phaseStarted = DateTime.UtcNow; probeTimer.Start(); };
        }

        private Control NewControl(int index)
        {
            switch (index % 5)
            {
                case 0: return new TemplateActionButton();
                case 1: return new ActionCard();
                case 2: return new TunerActionButton();
                case 3: return new Button();
                default: return new PictureBox { SizeMode = PictureBoxSizeMode.CenterImage };
            }
        }

        private void BeginMeasurement()
        {
            content.PerformLayout();
            Application.DoEvents();
            for (int i = 0; i < targets.Count; i++)
            {
                originalHandles.Add(targets[i].Handle);
                originalLocations.Add(targets[i].Location);
                targets[i].Invalidated += delegate { Interlocked.Increment(ref applyCount); };
            }
            content.ControlAdded += delegate { added++; };
            content.ControlRemoved += delegate { removed++; };
            content.SizeChanged += delegate { sizeChanged++; QueueContentResizeRender(); };
            content.Resize += delegate { QueueContentResizeRender(); };

            if (withIcons)
            {
                for (int i = 0; i < buttonCount; i++)
                {
                    string url = i < 2 ? "shared" : "icon-" + i;
                    loadDelays[url] = DelayFor(url);
                    QueueButtonIconLoad(url, targets[i], 32);
                }
            }
            phase = 1;
            phaseStarted = DateTime.UtcNow;
        }

        private int DelayFor(string url)
        {
            int index = url == "shared" ? 0 : Int32.Parse(url.Substring(5));
            int[,] profiles = new int[,] { { 5, 190, 30, 125, 65 }, { 175, 20, 230, 55, 100 }, { 70, 130, 10, 210, 35 } };
            return profiles[profile, index];
        }

        private bool IconsReady()
        {
            lock (iconCacheLock)
            {
                if (buttonIconTargets.Count != 0) return false;
            }
            foreach (Control target in targets)
            {
                if (CurrentIcon(target) == null) return false;
            }
            return true;
        }

        private static Image CurrentIcon(Control target)
        {
            TemplateActionButton template = target as TemplateActionButton;
            ActionCard card = target as ActionCard;
            TunerActionButton tuner = target as TunerActionButton;
            if (template != null) return template.IconImage;
            if (card != null) return card.IconImage;
            if (tuner != null) return tuner.IconImage;
            Button button = target as Button;
            if (button != null) return button.Image;
            PictureBox picture = target as PictureBox;
            return picture == null ? null : picture.Image;
        }

        private void ProbeTick(object sender, EventArgs args)
        {
            try
            {
                if ((DateTime.UtcNow - phaseStarted).TotalSeconds > 8) throw new Exception("Timed out: count=" + buttonCount + ", profile=" + profile);
                if (phase == 0)
                {
                    if ((DateTime.UtcNow - phaseStarted).TotalMilliseconds < 300) return;
                    BeginMeasurement();
                    return;
                }
                if (phase == 1)
                {
                    if (withIcons && !IconsReady()) return;
                    settleUntil = DateTime.UtcNow.AddMilliseconds(250);
                    phase = 2;
                    return;
                }
                if (DateTime.UtcNow < settleUntil) return;
                VerifyStableLayout();
                Close();
            }
            catch (Exception ex)
            {
                Failure = ex;
                Close();
            }
        }

        private void VerifyStableLayout()
        {
            if (content.Controls.Count != buttonCount) throw new Exception("Control count changed");
            if (added != 0 || removed != 0) throw new Exception("FlowLayoutPanel control tree changed: added=" + added + ", removed=" + removed);
            if (sizeChanged != 0 || fullPageRenders != 0) throw new Exception("Resize path rendered the page: sizeChanged=" + sizeChanged + ", fullPageRenders=" + fullPageRenders);
            for (int i = 0; i < targets.Count; i++)
            {
                if (!Object.ReferenceEquals(content.Controls[i], targets[i])) throw new Exception("Control instance changed at index " + i);
                if (targets[i].Handle != originalHandles[i]) throw new Exception("Control handle changed at index " + i);
                if (targets[i].Location != originalLocations[i]) throw new Exception("Flow layout moved a control at index " + i);
                if (withIcons && (CurrentIcon(targets[i]) == null || CurrentIcon(targets[i]).Width != 32 || CurrentIcon(targets[i]).Height != 32))
                    throw new Exception("Icon missing from control " + i);
                if (withIcons && applyCount == 0) throw new Exception("No target invalidation was observed");
            }
            Console.WriteLine("count={0}, icons={1}, profile={2}, scroll={3}, loads={4}, adds={5}, removes={6}, sizeChanges={7}, fullRenders={8}",
                buttonCount, withIcons ? buttonCount : 0, profile, content.VerticalScroll.Visible, loadCounts.Count, added, removed, sizeChanged, fullPageRenders);
        }

        private string ResolveAssetUrl(string url) { return url; }

        private Image LoadRemoteImage(string url, int width, int height)
        {
            string key = width + "x" + height + "|" + url;
            int delay = 0;
            lock (iconCacheLock)
            {
                Image cached;
                if (iconCache.TryGetValue(key, out cached)) return cached;
                int count;
                loadCounts.TryGetValue(url, out count);
                loadCounts[url] = count + 1;
                loadDelays.TryGetValue(url, out delay);
            }
            if (delay > 0) Thread.Sleep(delay);
            Bitmap image = new Bitmap(width, height);
            using (Graphics graphics = Graphics.FromImage(image)) graphics.Clear(Color.FromArgb(40 + (url.Length * 13) % 180, 100, 210));
            lock (iconCacheLock)
            {
                Image existing;
                if (iconCache.TryGetValue(key, out existing)) { image.Dispose(); return existing; }
                iconCache[key] = image;
            }
            return image;
        }

        private void RenderCurrentVisiblePage() { fullPageRenders++; }

        __QUEUE_METHOD__

        __APPLY_METHOD__

        __RESIZE_METHOD__

        __RESIZE_TIMER_METHOD__
    }

    internal static class Program
    {
        [STAThread]
        private static int Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            for (int count = 3; count <= 5; count++)
            {
                for (int profile = 0; profile < 3; profile++)
                {
                    HarnessForm withIcons = new HarnessForm(count, profile, true);
                    Application.Run(withIcons);
                    if (withIcons.Failure != null) throw withIcons.Failure;
                }
                HarnessForm noIcons = new HarnessForm(count, 0, false);
                Application.Run(noIcons);
                if (noIcons.Failure != null) throw noIcons.Failure;
            }
            return 0;
        }
    }
}
'''.replace("__QUEUE_METHOD__", queue_method).replace("__APPLY_METHOD__", apply_method).replace("__RESIZE_METHOD__", resize_method).replace("__RESIZE_TIMER_METHOD__", resize_timer_method)

    def test_real_flow_layout_panel_keeps_button_tree_stable(self):
        result = subprocess.run([str(self.exe)], capture_output=True, text=True, timeout=45)
        self.assertEqual(0, result.returncode, result.stderr or result.stdout)
        self.assertEqual(12, len([line for line in result.stdout.splitlines() if line.startswith("count=")]), result.stdout)
        self.assertIn("fullRenders=0", result.stdout)
        self.assertIn("scroll=True", result.stdout)


if __name__ == "__main__":
    unittest.main()
