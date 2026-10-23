import importlib.util
import json
import os
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
APP_PATH = ROOT / "src" / "ToolboxAdminApi-oneclick" / "app.py"
INSTALL_SCRIPT = ROOT / "src" / "ToolboxAdminApi-oneclick" / "install-baota.sh"
MANAGER_SCRIPT = ROOT / "script" / "toolbox-admin.sh"
LATEST_PACKAGE = ROOT / "packages" / "toolbox-admin-local-latest.tar.gz"

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

    def test_windows_exe_validation_requires_complete_managed_pe(self):
        def managed_pe(optional_magic=0x10B, include_clr=True):
            optional_size = 0xE0 if optional_magic == 0x10B else 0xF0
            optional_header = 0x98
            section_table = optional_header + optional_size
            data = bytearray(section_table + 40 + 0x200)
            data[:2] = b"MZ"
            struct.pack_into("<I", data, 0x3C, 0x80)
            data[0x80:0x84] = b"PE\0\0"
            file_header = 0x84
            struct.pack_into("<H", data, file_header + 2, 1)
            struct.pack_into("<H", data, file_header + 16, optional_size)
            struct.pack_into("<H", data, optional_header, optional_magic)
            number_of_directories_offset = 92 if optional_magic == 0x10B else 108
            directories_offset = 96 if optional_magic == 0x10B else 112
            struct.pack_into("<I", data, optional_header + number_of_directories_offset, 16)
            if include_clr:
                struct.pack_into("<II", data, optional_header + directories_offset + 14 * 8, 0x2000, 0x48)
            struct.pack_into("<IIII", data, section_table + 8, 0x200, 0x2000, 0x200, 0x200)
            struct.pack_into("<I", data, 0x200, 0x48)
            return data

        self.assertTrue(app.is_windows_exe(managed_pe()))
        self.assertTrue(app.is_windows_exe(managed_pe(0x20B)))
        self.assertFalse(app.is_windows_exe(b"MZ" + bytes(128)))
        self.assertFalse(app.is_windows_exe(managed_pe(include_clr=False)))
        self.assertFalse(app.is_windows_exe(managed_pe()[:0x90]))

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

    def test_install_and_update_copy_the_cloud_resolver_module(self):
        installer = INSTALL_SCRIPT.read_text(encoding="utf-8")
        manager = MANAGER_SCRIPT.read_text(encoding="utf-8")

        self.assertIn('cp -a "$src_dir/cloud_resolver.py" "$app_dir/"', installer)
        self.assertIn('[ -f "$src/cloud_resolver.py" ]', manager)
        self.assertIn('cmp -s "$src/cloud_resolver.py" "$dir/cloud_resolver.py"', manager)

    def test_latest_deployment_package_contains_cloud_resolver_module(self):
        with tarfile.open(LATEST_PACKAGE, "r:gz") as package:
            self.assertIn("ToolboxAdminApi-oneclick/cloud_resolver.py", package.getnames())

    def test_latest_package_contains_fixed_client_template(self):
        with tarfile.open(LATEST_PACKAGE, "r:gz") as package:
            source = package.extractfile("ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs").read().decode("utf-8-sig")
        self.assertIn("using System.Globalization;", source)
        self.assertIn('false), "", packageId, name.Equals(primaryName', source)
        self.assertIn('string launchStatus = "已下载";', source)

    def test_client_and_admin_exe_compilation_force_utf8(self):
        source = APP_PATH.read_text(encoding="utf-8")
        self.assertEqual(2, source.count('src.write_text(source, encoding="utf-8-sig")'))
        self.assertEqual(2, source.count('"-codepage:65001"'))

    def test_latest_package_excludes_runtime_data_and_esports_audio_feature(self):
        with tarfile.open(LATEST_PACKAGE, "r:gz") as package:
            names = package.getnames()
            self.assertFalse(any("/data/" in name or name.endswith("/data") for name in names))
            for name in (
                "ToolboxAdminApi-oneclick/app.py",
                "ToolboxAdminApi-oneclick/client-template/ToolboxClient.cs",
                "ToolboxAdminApi-oneclick/wwwroot/admin.js",
                "ToolboxAdminApi-oneclick/wwwroot/index.html",
                "ToolboxAdminApi-oneclick/wwwroot/styles.css",
            ):
                content = package.extractfile(name).read().decode("utf-8-sig")
                self.assertNotRegex(content, r"esportsAudioModule|ESPORTS_AUDIO|电竞音频|__esports_audio_module__")

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
