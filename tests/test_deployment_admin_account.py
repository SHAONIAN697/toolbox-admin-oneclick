import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"
INSTALL_SCRIPT = ROOT / "src" / "ToolboxAdminApi-oneclick" / "install-baota.sh"
MANAGER_SCRIPT = ROOT / "script" / "toolbox-admin.sh"

os.environ.setdefault("TOOLBOX_ADMIN_TOKEN", "test-admin-password")
spec = importlib.util.spec_from_file_location("toolbox_deployment_admin_app", APP_PATH)
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class DeploymentAdminAccountTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        data = Path(self.temp.name)
        app.DATA = data
        app.USERS_PATH = data / "users.json"
        app.USER_DATA = data / "users"
        app.USER_TEMPLATE_PATH = data / "user-template.json"
        app.ADMIN_TOKEN = "bootstrap-password-123"
        app.ADMIN_USERNAME = "13234876237"

    def tearDown(self):
        self.temp.cleanup()

    def test_first_install_uses_configured_admin_username_and_password(self):
        store = app.read_users()
        admin = store["users"][0]

        self.assertEqual(admin["username"], "13234876237")
        self.assertEqual(admin["role"], "super")
        self.assertTrue(app.check_password("bootstrap-password-123", admin["passwordHash"]))

    def test_existing_admin_username_is_not_reset_by_bootstrap_environment(self):
        existing = {
            "id": "admin",
            "username": "13234876237",
            "role": "super",
            "active": True,
            "passwordHash": app.stored_password("existing-password"),
        }
        app.write_json(app.USERS_PATH, {"users": [existing], "inviteCodes": [], "settings": {}})
        app.ADMIN_USERNAME = "admin"
        app.ADMIN_TOKEN = "different-bootstrap-password"

        store = app.read_users()

        self.assertEqual(store["users"][0]["username"], "13234876237")
        self.assertTrue(app.check_password("existing-password", store["users"][0]["passwordHash"]))

    def test_install_script_reads_actual_active_super_admin_accounts(self):
        script = INSTALL_SCRIPT.read_text(encoding="utf-8")

        self.assertIn('user.get("role") != "super"', script)
        self.assertIn('user.get("active", True) is False', script)
        self.assertIn('echo "管理员账号：${actual_admin_accounts:-$admin_username}"', script)
        self.assertNotIn('echo "管理员账号：admin"', script)
        self.assertIn("密码已加密，无法显示明文", script)

    def test_password_manager_targets_real_super_admin_and_revokes_sessions(self):
        script = MANAGER_SCRIPT.read_text(encoding="utf-8")

        self.assertIn('u.get("username") == target', script)
        self.assertIn('u.get("role") == "super"', script)
        self.assertIn('row.get("userId") == admin.get("id")', script)
        self.assertIn('hashlib.pbkdf2_hmac("sha256"', script)
        self.assertNotIn('u.get("username")=="admin"', script)
        self.assertIn("检测到多个启用中的超级管理员", script)

    def test_password_manager_changes_phone_admin_and_only_revokes_its_sessions(self):
        bash = shutil.which("bash")
        if not bash:
            git_bash = Path("C:/Program Files/Git/bin/bash.exe")
            bash = str(git_bash) if git_bash.exists() else ""
        if not bash:
            self.skipTest("bash is unavailable")

        root = Path(self.temp.name)
        (root / "data").mkdir()
        users = {
            "users": [
                {
                    "id": "admin",
                    "username": "13234876237",
                    "role": "super",
                    "active": True,
                    "passwordHash": app.stored_password("old-password"),
                },
                {
                    "id": "user-1",
                    "username": "ordinary",
                    "role": "user",
                    "active": True,
                    "passwordHash": app.stored_password("user-password"),
                },
            ],
            "inviteCodes": [],
            "settings": {},
        }
        sessions = {
            "admin-session": {"userId": "admin", "createdAt": app.now_iso()},
            "user-session": {"userId": "user-1", "createdAt": app.now_iso()},
        }
        (root / "data/users.json").write_text(json.dumps(users), encoding="utf-8")
        (root / "data/sessions.json").write_text(json.dumps(sessions), encoding="utf-8")

        env = os.environ.copy()
        env["TOOLBOX_ADMIN_SOURCE_ONLY"] = "1"
        env["TEST_APP_DIR"] = root.as_posix()
        env["PYTHON_BIN"] = Path(sys.executable).as_posix()
        env["PYTHONUTF8"] = "1"
        command = f'''
source "{MANAGER_SCRIPT.as_posix()}"
app_dir() {{ printf '%s' "$TEST_APP_DIR"; }}
python3() {{ "$PYTHON_BIN" "$@"; }}
systemctl() {{ return 0; }}
change_password
'''
        completed = subprocess.run(
            [bash, "-lc", command],
            input="new-password-123\nnew-password-123\n",
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            env=env,
            check=False,
        )

        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        updated_users = json.loads((root / "data/users.json").read_text(encoding="utf-8"))
        updated_admin = next(user for user in updated_users["users"] if user["id"] == "admin")
        self.assertTrue(
            app.check_password("new-password-123", updated_admin["passwordHash"]),
            completed.stdout + completed.stderr + "\n" + updated_admin["passwordHash"],
        )
        updated_sessions = json.loads((root / "data/sessions.json").read_text(encoding="utf-8"))
        self.assertNotIn("admin-session", updated_sessions)
        self.assertIn("user-session", updated_sessions)
        self.assertIn("13234876237", completed.stdout)


if __name__ == "__main__":
    unittest.main()
