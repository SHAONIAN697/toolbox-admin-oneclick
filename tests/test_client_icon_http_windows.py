"""Exercise the production image downloader against delayed local HTTP responses."""
import base64
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest

from tests.test_client_icon_refresh_winforms import find_csharp_compiler
from tests.test_client_variant_icon_windows import SOURCE, fixture_source


PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
)


class ClientIconHttpWindowTests(unittest.TestCase):
    def test_production_downloader_handles_delayed_icons_and_retries(self):
        if os.name != "nt":
            self.skipTest("Windows desktop required")
        compiler = find_csharp_compiler()
        if not compiler:
            self.skipTest("C# compiler required")
        counts = Counter()
        counts_lock = threading.Lock()

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                with counts_lock:
                    counts[self.path] += 1
                    attempt = counts[self.path]
                if self.path == "/icons/2.png" and attempt <= 2:
                    self.send_response(503)
                    self.end_headers()
                    return
                delay = {"/icons/0.png": 0.08, "/icons/1.png": 0.25, "/icons/2.png": 0.04, "/icons/3.png": 0.45}.get(self.path, 0)
                time.sleep(delay)
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(PNG)))
                self.end_headers()
                self.wfile.write(PNG)

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            production = SOURCE.read_text(encoding="utf-8-sig")
            start = production.index("        private Image LoadRemoteImage(")
            end = production.index("        private string ResolveAssetUrl(string url)", start)
            downloader = production[start:end]
            runner = r'''
internal static class HttpRunner
{
    [STAThread]
    private static int Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            using (var form = new ToolboxClient.ToolboxForm("http://127.0.0.1/api/toolbox/config?key=http-fixture"))
                form.RunIconFixture(4, true, 0);
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}
'''
            source = fixture_source("original", runner=runner)
            start = source.index("        private Image LoadRemoteImage(")
            end = source.index("        private string ResolveAssetUrl(string url)", start)
            source = source[:start] + downloader + source[end:]
            source = source.replace("https://example.invalid/icons/", f"http://127.0.0.1:{server.server_port}/icons/")
            # Leave enough time for production 350ms/700ms backoff and the final response.
            source = source.replace("FixturePump(1150);", "FixturePump(2200);")
            with tempfile.TemporaryDirectory() as temp:
                src = Path(temp) / "HttpFixture.cs"
                exe = src.with_suffix(".exe")
                src.write_text(source, encoding="utf-8-sig")
                args = [compiler, "-codepage:65001", "-target:exe", "-main:HttpRunner", "-out:" + str(exe)]
                args += ["-r:" + name + ".dll" for name in ("System", "System.Core", "System.Windows.Forms", "System.Drawing", "System.Web.Extensions", "System.IO.Compression", "System.IO.Compression.FileSystem")]
                built = subprocess.run(args + [str(src)], capture_output=True, text=True, errors="replace", timeout=60)
                self.assertEqual(0, built.returncode, built.stdout + built.stderr)
                result = subprocess.run([str(exe)], capture_output=True, text=True, errors="replace", timeout=15)
                self.assertEqual(0, result.returncode, result.stdout + result.stderr)
                self.assertIn("fullRenders=0", result.stdout)
                self.assertIn("displayed=4", result.stdout)
                self.assertEqual({"/icons/0.png": 1, "/icons/1.png": 1, "/icons/2.png": 3, "/icons/3.png": 1}, dict(counts))
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
