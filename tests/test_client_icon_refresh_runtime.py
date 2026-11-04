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


class ClientIconRefreshRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compiler = find_csharp_compiler()
        if not cls.compiler:
            raise unittest.SkipTest("No C# compiler installed")
        source = CLIENT_SOURCE.read_text(encoding="utf-8-sig")
        if "buttonIconTargets = new Dictionary<string, List<Control>>(StringComparer.Ordinal);" not in source:
            raise AssertionError("Button target keys must match the case-sensitive icon cache keys")
        queue = extract_method(
            source,
            "private void QueueButtonIconLoad(string url, Control target, int size)",
            "private void ApplyButtonIconImage",
        )
        apply_icon = extract_method(
            source,
            "private void ApplyButtonIconImage(Control target, Image image)",
            "private Image LoadRemoteImage",
        )
        if "RenderCurrentVisiblePage" in queue + apply_icon:
            raise AssertionError("Asynchronous button icon path still requests a full page render")

        cls.temp = tempfile.TemporaryDirectory()
        cls.exe = Path(cls.temp.name) / "ClientIconRefreshRuntimeTests.exe"
        harness = cls.build_harness(queue.replace("private void QueueButtonIconLoad(", "public void QueueButtonIconLoad(", 1), apply_icon)
        source_file = Path(cls.temp.name) / "ClientIconRefreshRuntimeTests.cs"
        source_file.write_text(harness, encoding="utf-8-sig")
        args = [
            cls.compiler,
            "-codepage:65001",
            "-target:exe",
            f"-out:{cls.exe}",
            "-r:System.dll",
            "-r:System.Core.dll",
            str(source_file),
        ]
        result = subprocess.run(args, capture_output=True, text=True, timeout=60)
        if result.returncode != 0 or not cls.exe.exists():
            cls.temp.cleanup()
            raise RuntimeError("Icon refresh test harness compilation failed:\n" + (result.stderr or result.stdout))

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "temp"):
            cls.temp.cleanup()

    @staticmethod
    def build_harness(queue_method, apply_method):
        return r'''using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Threading;

namespace IconRefreshRuntimeTest
{
    public class Image
    {
        public readonly string Url;
        public Image(string url) { Url = url; }
        public void Dispose() { }
    }
    public sealed class Bitmap : Image
    {
        public Bitmap(Image source) : base(source.Url) { }
    }
    public class Control
    {
        public readonly int InstanceId;
        public bool IsDisposed;
        public bool Disposing;
        public int Invalidations;
        public Image Image;
        public Image IconImage;
        private static int nextId;
        public Control() { InstanceId = Interlocked.Increment(ref nextId); }
        public void Invalidate() { Invalidations++; }
        public Image CurrentIcon { get { return IconImage ?? Image; } }
    }
    public sealed class TemplateActionButton : Control { }
    public sealed class ActionCard : Control { }
    public sealed class TunerActionButton : Control { }
    public sealed class Button : Control { }
    public sealed class PictureBox : Control { }

    public sealed class ClientHarness
    {
        private readonly object iconCacheLock = new object();
        private readonly Dictionary<string, Image> iconCache = new Dictionary<string, Image>();
        private readonly Dictionary<string, List<Control>> buttonIconTargets = new Dictionary<string, List<Control>>(StringComparer.Ordinal);
        private readonly ConcurrentQueue<Action> uiQueue = new ConcurrentQueue<Action>();
        public readonly Dictionary<string, int> loadCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        public readonly Dictionary<string, int> loadDelays = new Dictionary<string, int>(StringComparer.Ordinal);
        public readonly Dictionary<string, int> failuresRemaining = new Dictionary<string, int>(StringComparer.Ordinal);
        public int FullPageRenders;
        public int BusinessRefreshSchedules;
        public bool IsDisposed;
        public bool Disposing;
        public bool IsHandleCreated = true;

        private string ResolveAssetUrl(string url) { return url; }
        private void BeginInvoke(Action action) { uiQueue.Enqueue(action); }
        private void ScheduleBusinessIconRefresh()
        {
            BusinessRefreshSchedules++;
            RenderCurrentVisiblePage();
        }
        private void RenderCurrentVisiblePage() { FullPageRenders++; }
        public int PendingUiActions { get { return uiQueue.Count; } }
        public int PendingTargetBatches { get { lock (iconCacheLock) return buttonIconTargets.Count; } }
        public int LoadCount(string url) { lock (iconCacheLock) { int count; return loadCounts.TryGetValue(url, out count) ? count : 0; } }

        private Image LoadRemoteImage(string url, int width, int height)
        {
            string cacheKey = width + "x" + height + "|" + url;
            int delay = 0;
            lock (iconCacheLock)
            {
                Image cached;
                if (iconCache.TryGetValue(cacheKey, out cached)) return cached;
                int count;
                loadCounts.TryGetValue(url, out count);
                loadCounts[url] = count + 1;
                int failures;
                if (failuresRemaining.TryGetValue(url, out failures) && failures > 0)
                {
                    failuresRemaining[url] = failures - 1;
                    return null;
                }
                loadDelays.TryGetValue(url, out delay);
            }
            if (delay > 0) Thread.Sleep(delay);
            Image image = new Image(url);
            lock (iconCacheLock)
            {
                Image existing;
                if (iconCache.TryGetValue(cacheKey, out existing)) return existing;
                iconCache[cacheKey] = image;
            }
            return image;
        }

        public void DrainUiQueue()
        {
            Action action;
            while (uiQueue.TryDequeue(out action)) action();
        }

        public bool WaitForUiActions(int count, int timeoutMs)
        {
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            while (DateTime.UtcNow < deadline)
            {
                if (PendingUiActions >= count) return true;
                Thread.Sleep(10);
            }
            return PendingUiActions >= count;
        }

        public bool WaitForNoPendingTargets(int timeoutMs)
        {
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            while (DateTime.UtcNow < deadline)
            {
                if (PendingTargetBatches == 0) return true;
                Thread.Sleep(10);
            }
            return PendingTargetBatches == 0;
        }

        __QUEUE_METHOD__

        __APPLY_METHOD__
    }

    internal static class Program
    {
        private static void Require(bool condition, string message)
        {
            if (!condition) throw new Exception(message);
        }

        private static Control NewControl(int index)
        {
            switch (index % 5)
            {
                case 0: return new TemplateActionButton();
                case 1: return new ActionCard();
                case 2: return new TunerActionButton();
                case 3: return new Button();
                default: return new PictureBox();
            }
        }

        private static void VerifyButtonCountsAndLoadOrders()
        {
            for (int count = 3; count <= 5; count++)
            {
                for (int profile = 0; profile < 3; profile++)
                {
                    ClientHarness client = new ClientHarness();
                    client.loadDelays["shared"] = profile == 0 ? 0 : (profile == 1 ? 170 : 40);
                    client.loadDelays["icon-2"] = profile == 0 ? 190 : (profile == 1 ? 25 : 120);
                    client.loadDelays["icon-3"] = profile == 0 ? 35 : (profile == 1 ? 210 : 5);
                    client.loadDelays["icon-4"] = profile == 0 ? 120 : (profile == 1 ? 10 : 240);
                    List<Control> controls = new List<Control>();
                    List<int> instances = new List<int>();
                    List<string> urls = new List<string>();
                    for (int i = 0; i < count; i++)
                    {
                        Control control = NewControl(i);
                        controls.Add(control);
                        instances.Add(control.InstanceId);
                        string url = i < 2 ? "shared" : "icon-" + i;
                        urls.Add(url);
                        client.QueueButtonIconLoad(url, control, 32);
                    }
                    HashSet<string> unique = new HashSet<string>(urls, StringComparer.OrdinalIgnoreCase);
                    Require(client.WaitForUiActions(unique.Count, 4000), "Timed out waiting for icon completions: count=" + count + ", profile=" + profile);
                    client.DrainUiQueue();
                    Require(controls.Count == count, "Button count changed during icon loads");
                    Require(client.FullPageRenders == 0, "Icon completion triggered a full page render");
                    Require(client.BusinessRefreshSchedules == 0, "Icon completion scheduled a full page refresh");
                    for (int i = 0; i < count; i++)
                    {
                        Require(controls[i].InstanceId == instances[i], "Button control instance changed");
                        Require(controls[i].CurrentIcon != null && controls[i].CurrentIcon.Url == urls[i], "Button icon did not reach its target");
                        Require(controls[i].Invalidations == 1, "Target was not locally invalidated exactly once");
                        Require(client.LoadCount(urls[i]) == 1, "Same icon URL was fetched more than once");
                    }
                }
            }
        }

        private static void VerifyNoIconButtonsDoNotScheduleLoads()
        {
            for (int count = 3; count <= 5; count++)
            {
                ClientHarness client = new ClientHarness();
                List<Control> controls = new List<Control>();
                for (int i = 0; i < count; i++)
                {
                    Control control = NewControl(i);
                    controls.Add(control);
                    client.QueueButtonIconLoad("", control, 32);
                }
                Thread.Sleep(30);
                Require(client.PendingTargetBatches == 0 && client.PendingUiActions == 0, "No-icon page scheduled icon work");
                Require(client.FullPageRenders == 0 && controls.Count == count, "No-icon page changed its control tree");
                Require(client.BusinessRefreshSchedules == 0, "No-icon page scheduled an icon refresh");
            }
        }

        private static void VerifyDisposedTargetIsIgnored()
        {
            ClientHarness client = new ClientHarness();
            Control control = new TemplateActionButton();
            client.loadDelays["slow"] = 100;
            client.QueueButtonIconLoad("slow", control, 32);
            control.IsDisposed = true;
            Require(client.WaitForUiActions(1, 2000), "Timed out waiting for disposed target completion");
            client.DrainUiQueue();
            Require(control.Invalidations == 0, "Disposed target was updated");
            Require(client.FullPageRenders == 0, "Disposed target caused a page render");
            Require(client.BusinessRefreshSchedules == 0, "Disposed target scheduled a page refresh");
        }

        private static void VerifyFailedRequestCanRetry()
        {
            ClientHarness client = new ClientHarness();
            Control control = new Button();
            client.failuresRemaining["retry"] = 3;
            client.QueueButtonIconLoad("retry", control, 32);
            Require(client.WaitForNoPendingTargets(5000), "Failed icon request did not clear its pending targets");
            Require(client.LoadCount("retry") == 3, "Initial retry count changed");
            client.QueueButtonIconLoad("retry", control, 32);
            Require(client.WaitForUiActions(1, 2000), "Failed icon request was not retried");
            client.DrainUiQueue();
            Require(control.CurrentIcon != null && client.LoadCount("retry") == 4, "Retry did not display the icon");
        }

        private static void VerifyDistinctPathsAndSizesStayIsolated()
        {
            ClientHarness client = new ClientHarness();
            Control upper = new Button();
            Control lower = new Button();
            client.loadDelays["icons/Logo.png"] = 80;
            client.loadDelays["icons/logo.png"] = 80;
            client.QueueButtonIconLoad("icons/Logo.png", upper, 32);
            client.QueueButtonIconLoad("icons/logo.png", lower, 32);
            Require(client.WaitForUiActions(2, 2000), "Distinct case-sensitive paths were merged into one request");
            client.DrainUiQueue();
            Require(upper.CurrentIcon != null && upper.CurrentIcon.Url == "icons/Logo.png", "Uppercase icon path was replaced");
            Require(lower.CurrentIcon != null && lower.CurrentIcon.Url == "icons/logo.png", "Lowercase icon path was replaced");
            Require(client.LoadCount("icons/Logo.png") == 1 && client.LoadCount("icons/logo.png") == 1, "Distinct URL loads were lost");

            Control small = new Button();
            Control large = new Button();
            client.QueueButtonIconLoad("sized", small, 16);
            client.QueueButtonIconLoad("sized", large, 64);
            Require(client.WaitForUiActions(2, 2000), "Distinct icon sizes were merged");
            client.DrainUiQueue();
            Require(small.CurrentIcon != null && large.CurrentIcon != null && !Object.ReferenceEquals(small.CurrentIcon, large.CurrentIcon), "Different sizes share the same image");
            Require(client.LoadCount("sized") == 2, "Different sizes did not get separate cache entries");
        }

        private static int Main()
        {
            try
            {
                VerifyButtonCountsAndLoadOrders();
                VerifyNoIconButtonsDoNotScheduleLoads();
                VerifyDisposedTargetIsIgnored();
                VerifyFailedRequestCanRetry();
                VerifyDistinctPathsAndSizesStayIsolated();
                Console.WriteLine("3/4/5 buttons, varied icon order, no-icon, disposed-target, retry, and URL/size isolation scenarios passed.");
                return 0;
            }
            catch (Exception ex) { Console.Error.WriteLine(ex.Message); return 1; }
        }
    }
}
'''.replace("__QUEUE_METHOD__", queue_method).replace("__APPLY_METHOD__", apply_method)

    def test_shared_template_icon_loader_runtime_scenarios(self):
        result = subprocess.run([str(self.exe)], capture_output=True, text=True, errors="replace", timeout=30)
        self.assertEqual(0, result.returncode, result.stderr or result.stdout)
        self.assertIn("3/4/5 buttons", result.stdout)


if __name__ == "__main__":
    unittest.main()
