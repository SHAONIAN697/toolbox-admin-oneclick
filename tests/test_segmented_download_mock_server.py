import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen


DATA = bytes(range(256)) * 4096


class MockDownloadHandler(BaseHTTPRequestHandler):
    entry_hits = 0
    final_hits = 0
    ranges = []

    def do_GET(self):
        if self.path == "/entry":
            type(self).entry_hits += 1
            self.send_response(302)
            self.send_header("Location", "/file?sig=local-test")
            self.end_headers()
            return
        if self.path.startswith("/file"):
            type(self).final_hits += 1
            value = self.headers.get("Range", "")
            if not value:
                self.send_response(200)
                self.send_header("Content-Length", str(len(DATA)))
                self.end_headers()
                self.wfile.write(DATA)
                return
            start, end = [int(part) for part in value.removeprefix("bytes=").split("-")]
            type(self).ranges.append((start, end))
            body = DATA[start : end + 1]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(DATA)}")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def log_message(self, *_args):
        return


class SegmentedDownloadMockServerTests(unittest.TestCase):
    def setUp(self):
        MockDownloadHandler.entry_hits = 0
        MockDownloadHandler.final_hits = 0
        MockDownloadHandler.ranges = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), MockDownloadHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def test_task_resolved_url_can_feed_32_range_requests_without_revisiting_entry(self):
        entry = f"http://127.0.0.1:{self.server.server_port}/entry"
        request = Request(entry, method="GET")
        with urlopen(request) as response:
            final_url = response.geturl()
        self.assertEqual(MockDownloadHandler.entry_hits, 1)
        MockDownloadHandler.final_hits = 0

        workers = []
        chunk = len(DATA) // 32
        for index in range(32):
            start = index * chunk
            end = len(DATA) - 1 if index == 31 else start + chunk - 1
            def fetch(start=start, end=end):
                request = Request(final_url, headers={"Range": f"bytes={start}-{end}"})
                with urlopen(request) as response:
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.headers["Content-Range"], f"bytes {start}-{end}/{len(DATA)}")
                    self.assertEqual(len(response.read()), end - start + 1)
            worker = threading.Thread(target=fetch)
            workers.append(worker)
            worker.start()
        for worker in workers:
            worker.join(timeout=2)

        self.assertEqual(MockDownloadHandler.entry_hits, 1)
        self.assertEqual(MockDownloadHandler.final_hits, 32)
        self.assertEqual(len(MockDownloadHandler.ranges), 32)


if __name__ == "__main__":
    unittest.main()
