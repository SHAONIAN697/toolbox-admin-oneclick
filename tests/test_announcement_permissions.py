import importlib.util
import tempfile
import unittest
from pathlib import Path


APP_PATH = Path(__file__).parents[1] / "src" / "ToolboxAdminApi-oneclick" / "app.py"
spec = importlib.util.spec_from_file_location("toolbox_announcement_permissions_app", APP_PATH)
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class Endpoint:
    headers = {}
    query = {}
    client_address = ("127.0.0.1", 1234)

    def __init__(self, body):
        self.body = body

    def read_body(self):
        return self.body

    def send_json(self, value, status=200):
        return status, value


class AnnouncementPermissionsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        data = Path(self.temp.name)
        app.ADMIN_ANNOUNCEMENTS_PATH = data / "announcements.json"
        app.ADMIN_ANNOUNCEMENT_READS_PATH = data / "reads.json"
        app.write_json(app.ADMIN_ANNOUNCEMENTS_PATH, {"announcements": [{
            "id": "a1", "title": "更新", "content": "内容", "status": "draft",
        }]})
        app.write_json(app.ADMIN_ANNOUNCEMENT_READS_PATH, {"reads": []})
        self.agent = {"id": "agent-a", "username": "agent-a", "role": "agent"}

    def tearDown(self):
        self.temp.cleanup()

    def call(self, path, method, body=None):
        endpoint = Endpoint(body or {})
        return app.Handler.handle_admin_announcements(endpoint, path, method, {"user": self.agent})

    def test_agent_cannot_create_publish_edit_or_delete_announcements(self):
        cases = [
            ("/api/admin/announcements", "POST", {"title": "代理公告", "content": "不允许"}),
            ("/api/admin/announcements/a1", "PUT", {"title": "代理修改", "content": "不允许"}),
            ("/api/admin/announcements/a1/publish", "POST", {}),
            ("/api/admin/announcements/a1", "DELETE", {}),
        ]
        for path, method, body in cases:
            status, payload = self.call(path, method, body)
            self.assertEqual(403, status, (path, method, payload))
            self.assertIn("总管理员", payload["error"])


if __name__ == "__main__":
    unittest.main()
