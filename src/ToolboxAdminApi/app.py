#!/usr/bin/env python3
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import shutil
import smtplib
import subprocess
import tempfile
import threading
import time
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

ROOT = Path(__file__).resolve().parent
WWW = ROOT / "wwwroot"
DATA = ROOT / "data"
USERS_PATH = DATA / "users.json"
MAIL_PATH = DATA / "mail.json"
SYSTEM_PATH = DATA / "system.json"
NOTICES_PATH = DATA / "notices.json"
ORDERS_PATH = DATA / "orders.json"
AGENT_APPLICATIONS_PATH = DATA / "agent-applications.json"
AGENT_LOGS_PATH = DATA / "agent-logs.json"
SESSIONS_PATH = DATA / "sessions.json"
USER_TEMPLATE_PATH = DATA / "user-template.json"
USER_DATA = DATA / "users"
CONFIG_SHARES_PATH = DATA / "config-shares.json"
CLIENT_TEMPLATE = ROOT / "client-template" / "ToolboxClient.cs"
ADMIN_DESKTOP_TEMPLATE = ROOT / "admin-desktop-template" / "ToolboxAdminDesktop.cs"
CLIENT_ICON = ROOT / "assets" / "toolbox-default.ico"
CLIENT_CACHE = DATA / "client-cache"
CLIENT_JOBS = DATA / "client-jobs"
CLIENT_INTEGRITY_PATH = DATA / "client-integrity.json"
ICON_CACHE = DATA / "icon-cache"
DEFAULT_APP_ICON = "/assets/toolbox-default-icon.png"
DEFAULT_ADMIN_TITLE = "工具箱后台登录"
DEFAULT_LOGIN_HINT = ""
STUDIO_OVERVIEW_PAGE_ID = "system_overview"


def default_studio_overview_page():
    return {
        "title": "\u7cfb\u7edf\u6982\u89c8",
        "name": "\u7cfb\u7edf\u6982\u89c8",
        "sections": [{
            "title": "\u53f3\u4e0b\u89d2\u5feb\u6377\u56fe\u6807",
            "buttons": [
                {"id": "overview_browser", "name": "\u6d4f\u89c8\u5668", "sort": 10, "icon": "", "action": "link", "url": "https://www.microsoft.com/edge", "target": "https://www.microsoft.com/edge", "enabled": True},
                {"id": "overview_wechat", "name": "\u5fae\u4fe1", "sort": 20, "icon": "", "action": "link", "url": "", "target": "", "enabled": True},
                {"id": "overview_yy", "name": "YY\u8bed\u97f3", "sort": 30, "icon": "", "action": "link", "url": "", "target": "", "enabled": True},
                {"id": "overview_studio_one", "name": "Studio one", "sort": 40, "icon": "", "action": "link", "url": "", "target": "", "enabled": True},
                {"id": "overview_karaoke", "name": "\u5168\u6c11K\u6b4c", "sort": 50, "icon": "", "action": "link", "url": "", "target": "", "enabled": True},
                {"id": "overview_live", "name": "\u76f4\u64ad\u4f34\u4fa3", "sort": 60, "icon": "", "action": "link", "url": "", "target": "", "enabled": True},
            ]
        }]
    }


def ensure_studio_overview_page(config):
    if not isinstance(config, dict):
        return False
    pages = config.setdefault("pages", {})
    if not isinstance(pages, dict):
        config["pages"] = {}
        pages = config["pages"]
    if STUDIO_OVERVIEW_PAGE_ID not in pages or not isinstance(pages.get(STUDIO_OVERVIEW_PAGE_ID), dict):
        pages[STUDIO_OVERVIEW_PAGE_ID] = default_studio_overview_page()
        return True
    page = pages[STUDIO_OVERVIEW_PAGE_ID]
    changed = False
    if not page.get("title"):
        page["title"] = "\u7cfb\u7edf\u6982\u89c8"
        changed = True
    sections = page.setdefault("sections", [])
    if not isinstance(sections, list) or not sections:
        page["sections"] = default_studio_overview_page()["sections"]
        changed = True
    else:
        first = sections[0] if isinstance(sections[0], dict) else {}
        if not isinstance(sections[0], dict):
            sections[0] = first
            changed = True
        first.setdefault("title", "\u53f3\u4e0b\u89d2\u5feb\u6377\u56fe\u6807")
        if not isinstance(first.get("buttons"), list):
            first["buttons"] = []
            changed = True
    return changed
ADMIN_TOKEN = os.environ.get("TOOLBOX_ADMIN_TOKEN", "dev-token")
SESSIONS = {}
CLIENT_BUILD_JOBS = {}
CLIENT_BUILD_LOCK = threading.Lock()
CLIENT_RUNTIME_TOKEN_TTL = 7 * 24 * 60 * 60
DEFAULT_CLIENT_VARIANT = "original"
CLIENT_VARIANTS = {
    "original": {
        "id": "original",
        "label": "原版工具箱",
        "file": "original",
        "description": "保留最开始的工具箱界面，继续跟随后台配置的主题、标题和按钮布局。",
    },
    "studio": {
        "id": "studio",
        "label": "调音师经典版",
        "file": "studio",
        "description": "左侧导航、分组面板和紧凑按钮布局，适合系统工具与音频维护场景。",
    },
    "tuner": {
        "id": "tuner",
        "label": "调音师工具箱简约版",
        "file": "tuner",
        "description": "按本地调音师工具箱的白色标题栏、左侧导航、折叠分组和底部状态栏复刻，继续使用当前后台配置和内置下载模块。",
    },
    "portal": {
        "id": "portal",
        "label": "导航首页版",
        "file": "portal",
        "description": "首页横幅、导航侧栏和资源卡片布局，适合软件中心与资源入口场景。",
    },
}

SCRIPT_LABELS = {
    "preset_new_machine": "新机一键优化",
    "preset_audio_workstation": "音频工站优化",
    "preset_privacy_lockdown": "隐私加固",
    "preset_pure_activate": "纯净激活套装",
    "sys_control_panel": "控制面板",
    "sys_sound_settings": "声音设置",
    "open_network_connections": "网络连接",
    "sys_apps_features": "程序和功能",
    "sys_device_manager": "设备管理器",
    "sys_disk_manager": "磁盘管理",
    "sys_computer_manager": "计算机管理",
    "sys_services": "服务",
    "sys_task_manager": "任务管理器",
    "sys_system_info": "系统信息",
    "sys_env_vars": "环境变量",
    "sys_event_viewer": "事件查看器",
    "sys_registry": "注册表",
    "sys_group_policy": "组策略",
    "sys_cmd_prompt": "命令提示符",
    "sys_security_policy": "安全策略",
    "disable_firewall": "关闭防火墙",
    "disable_update": "禁用系统更新",
    "sys_power_options": "电源管理",
    "sys_classic_context_menu": "Win 传统右键",
    "add_hosts_block": "编辑 Hosts",
    "sys_system_clean": "系统清理",
    "disable_uac": "禁用 UAC",
    "activate_windows": "一键激活系统",
}
SCRIPT_ID_BY_LABEL = {label: key for key, label in SCRIPT_LABELS.items()}


def normalize_script_target(value):
    text = str(value or "").strip()
    return text if text in SCRIPT_LABELS else SCRIPT_ID_BY_LABEL.get(text, text)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def random_hex(n=24):
    return secrets.token_hex(n)


def new_id(prefix="id"):
    return f"{prefix}_{int(time.time() * 1000):x}_{random_hex(4)}"


def normalize_public_base_url(base_url):
    parsed = urlparse(str(base_url or "").strip())
    if not parsed.netloc:
        return str(base_url or "").rstrip("/")
    scheme = parsed.scheme or "http"
    return f"{scheme}://{parsed.netloc}"


def sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def stored_password(password):
    salt = random_hex(16)
    return f"sha256${salt}${sha256_hex(salt + password)}"


def check_password(password, stored):
    try:
        kind, salt, digest = stored.split("$", 2)
    except ValueError:
        return False
    return kind == "sha256" and sha256_hex(salt + password) == digest


def hmac_sha256_hex(secret, text):
    return hmac.new(str(secret or "").encode("utf-8"), str(text or "").encode("utf-8"), hashlib.sha256).hexdigest()


def constant_time_equals(left, right):
    return hmac.compare_digest(str(left or ""), str(right or ""))


def read_json(path, fallback):
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def client_build_cleanup_settings():
    settings = read_system_settings().get("clientBuild") or {}
    try:
        cache_hours = max(1, min(24 * 30, int(settings.get("cacheRetentionHours") or 24)))
    except Exception:
        cache_hours = 24
    try:
        job_hours = max(1, min(24 * 30, int(settings.get("jobRetentionHours") or 24)))
    except Exception:
        job_hours = 24
    try:
        interval_minutes = max(10, min(24 * 60, int(settings.get("cleanupIntervalMinutes") or 360)))
    except Exception:
        interval_minutes = 360
    try:
        max_entries = max(1, min(200, int(settings.get("maxCacheEntries") or 30)))
    except Exception:
        max_entries = 30
    return {
        "cacheSeconds": cache_hours * 60 * 60,
        "jobSeconds": job_hours * 60 * 60,
        "intervalSeconds": interval_minutes * 60,
        "maxEntries": max_entries,
    }


def read_client_integrity():
    data = read_json(CLIENT_INTEGRITY_PATH, {"builds": {}, "tokens": {}})
    if not isinstance(data, dict):
        data = {"builds": {}, "tokens": {}}
    data.setdefault("builds", {})
    data.setdefault("tokens", {})
    return data


def write_client_integrity(data):
    data.setdefault("builds", {})
    data.setdefault("tokens", {})
    write_json(CLIENT_INTEGRITY_PATH, data)


def load_sessions():
    try:
        value = read_json(SESSIONS_PATH, {})
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def save_sessions():
    try:
        write_json(SESSIONS_PATH, SESSIONS)
    except Exception:
        pass


SESSIONS.update(load_sessions())


def default_popup_settings():
    return {
        "enabled": False,
        "clickCount": 3,
        "title": "联系我们 / 支持作者",
        "thanksText": "感谢你的支持，我们会持续维护和更新工具箱。",
        "cacheMinutes": 60,
        "contacts": [],
        "payments": [],
        "links": [],
    }


def default_config():
    return {
        "app": {
            "title": "Toolbox",
            "subtitle": "",
            "version": "V1.0",
            "logo_text": "Y",
            "icon": DEFAULT_APP_ICON,
            "admin_title": DEFAULT_ADMIN_TITLE,
            "login_hint": "",
            "window_width": 1080,
            "window_height": 700,
            "password": "",
            "theme": "鍗堝闈涜摑",
            "theme_count": 19,
            "allow_client_theme": True,
            "default_view_mode": "grid",
            "bg_path": "",
            "output_dir": "",
        },
        "license": {"enabled": False, "api_base": "", "product_code": ""},
        "popup": default_popup_settings(),
        "features": {"software_catalog_enabled": True},
        "page_locks": {},
        "sidebar": [],
        "toolbox_tabs": [],
        "pages": {},
    }


def config_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on", "enabled", "enable", "启用", "开启"):
        return True
    if text in ("0", "false", "no", "off", "disabled", "disable", "停用", "禁用", "关闭"):
        return False
    return default


def normalize_view_mode(value, default="grid"):
    text = str(value or "").strip().lower()
    if text in ("list", "列表", "listmode", "list_mode"):
        return "list"
    if text in ("grid", "宫格", "gongge", "gridmode", "grid_mode"):
        return "grid"
    return default


def normalize_feature_settings(config):
    changed = False
    features = config.get("features")
    if not isinstance(features, dict):
        features = {}
        config["features"] = features
        changed = True
    enabled = config_bool(features.get("software_catalog_enabled"), True)
    if features.get("software_catalog_enabled") is not enabled:
        features["software_catalog_enabled"] = enabled
        changed = True
    return changed


def normalize_page_locks(config):
    changed = False
    locks = config.get("page_locks")
    if not isinstance(locks, dict):
        locks = {}
        config["page_locks"] = locks
        changed = True
    for raw_page_id in list(locks.keys()):
        page_id = str(raw_page_id or "").strip()
        if not page_id:
            locks.pop(raw_page_id, None)
            changed = True
            continue
        if page_id != raw_page_id:
            locks[page_id] = locks.pop(raw_page_id)
            changed = True
        lock = locks.get(page_id)
        if not isinstance(lock, dict):
            lock = {"enabled": config_bool(lock, False), "password": ""}
            locks[page_id] = lock
            changed = True
        enabled = config_bool(lock.get("enabled"), False)
        if lock.get("enabled") is not enabled:
            lock["enabled"] = enabled
            changed = True
        password = str(lock.get("password") or "").strip()
        if password and not password.startswith("sha256$"):
            password = stored_password(password)
        if lock.get("password") != password:
            lock["password"] = password
            changed = True
        if "title" in lock:
            title = str(lock.get("title") or "").strip()
            if lock.get("title") != title:
                lock["title"] = title
                changed = True
    return changed


def safe_id(value):
    text = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in str(value).lower()).strip("_")
    return text or "user"


def user_display_name(user):
    if not user:
        return ""
    return (user.get("displayName") or user.get("username") or user.get("id") or "").strip()


def find_user_display_name(user_id="", username=""):
    user = find_user_by_id(user_id) if user_id else None
    if not user and username:
        user = find_user_by_username(username)
    return user_display_name(user) or username or user_id or ""


def exe_file_stem(user):
    return safe_id(user_display_name(user) or "user")


def clean_download_name_part(value):
    text = str(value or "").strip()
    invalid = '<>:"/\\|?*\r\n\t\0'
    text = "".join("_" if ch in invalid else ch for ch in text)
    text = " ".join(text.split()).strip(" ._")
    return (text[:80].strip(" ._") or "user")


def ascii_file_name_part(value, fallback="user"):
    text = str(value or "").strip()
    chars = []
    for ch in text:
        if ord(ch) < 128 and (ch.isalnum() or ch in "_-."):
            chars.append(ch)
        elif ch.isspace() or ch in "-_.":
            chars.append("_")
    cleaned = "".join(chars).strip("._-")
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return (cleaned[:80].strip("._-") or fallback)


def client_exe_filename(user, timestamp=None, variant=DEFAULT_CLIENT_VARIANT):
    stamp = int(timestamp or time.time())
    stem = ascii_file_name_part((user or {}).get("username") or (user or {}).get("id") or "user")
    suffix = client_variant_file_suffix(variant)
    return f"toolbox-{stem}-{suffix}-{stamp}.exe"


def ascii_download_fallback(filename):
    path = Path(str(filename or "download.bin"))
    suffix = path.suffix or ".bin"
    stem = "".join(ch if (ord(ch) < 128 and (ch.isalnum() or ch in "_-.")) else "_" for ch in path.stem).strip("._")
    stem = stem[:80].strip("._") or "download"
    return f"{stem}{suffix}"


def normalize_client_variant(value):
    variant = str(value or "").strip().lower()
    return variant if variant in CLIENT_VARIANTS else DEFAULT_CLIENT_VARIANT


def client_variant_info(value):
    return CLIENT_VARIANTS[normalize_client_variant(value)]


def public_client_variants():
    return {"variants": [dict(CLIENT_VARIANTS[key]) for key in ("original", "studio", "tuner", "portal")]}


def request_client_variant(handler, body=None):
    if body and body.get("variant"):
        return normalize_client_variant(body.get("variant"))
    if hasattr(handler, "query"):
        return normalize_client_variant(handler.query.get("variant", [""])[0])
    return DEFAULT_CLIENT_VARIANT


def client_variant_file_suffix(variant):
    return client_variant_info(variant).get("file") or normalize_client_variant(variant)


def find_csharp_compiler():
    compiler = shutil.which("mcs") or shutil.which("csc")
    if compiler:
        return compiler
    windows_dir = Path(os.environ.get("WINDIR", r"C:\Windows"))
    candidates = [
        windows_dir / "Microsoft.NET" / "Framework64" / "v4.0.30319" / "csc.exe",
        windows_dir / "Microsoft.NET" / "Framework" / "v4.0.30319" / "csc.exe",
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Mono" / "lib" / "mono" / "4.5" / "mcs.exe",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Mono" / "lib" / "mono" / "4.5" / "mcs.exe",
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Mono" / "bin" / "mcs.exe",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Mono" / "bin" / "mcs.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


def csharp_compile_command(compiler, args):
    compiler_path = Path(str(compiler or ""))
    if os.name == "nt" and compiler_path.suffix.lower() == ".exe":
        parts = [p.lower() for p in compiler_path.parts]
        if "mono" in parts and compiler_path.name.lower() in ("mcs.exe", "csc.exe"):
            mono = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Mono" / "bin" / "mono.exe"
            if not mono.exists():
                mono = Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Mono" / "bin" / "mono.exe"
            if mono.exists():
                return [str(mono), str(compiler_path)] + args
    return [str(compiler)] + args


def is_windows_exe(data):
    return isinstance(data, (bytes, bytearray)) and len(data) >= 2 and data[:2] == b"MZ"


def binary_header_preview(data, limit=16):
    if not isinstance(data, (bytes, bytearray)) or not data:
        return "empty"
    sample = bytes(data[:limit])
    return " ".join(f"{byte:02X}" for byte in sample)


def user_config_path(user_id):
    safe = safe_id(user_id)
    return USER_DATA / safe / "config.json"


def ensure_config_defaults(config):
    app = config.setdefault("app", {})
    changed = False
    if not app.get("icon") and not app.get("icon_url") and not app.get("icon_path"):
        app["icon"] = DEFAULT_APP_ICON
        changed = True
    if "login_hint" not in app:
        app["login_hint"] = DEFAULT_LOGIN_HINT
        changed = True
    if "admin_title" not in app:
        app["admin_title"] = DEFAULT_ADMIN_TITLE
        changed = True
    if app.get("password_enabled") is False and app.get("password"):
        app["password"] = ""
        changed = True
    default_view_mode = normalize_view_mode(app.get("default_view_mode"), "grid")
    if app.get("default_view_mode") != default_view_mode:
        app["default_view_mode"] = default_view_mode
        changed = True
    if normalize_feature_settings(config):
        changed = True
    if normalize_page_locks(config):
        changed = True
    if ensure_studio_overview_page(config):
        changed = True
    normalized_popup = normalize_popup_settings(config.get("popup") or {})
    if config.get("popup") != normalized_popup:
        config["popup"] = normalized_popup
        changed = True
    return changed


def read_config(user_id=""):
    path = user_config_path(user_id) if user_id else DATA / "config.json"
    if not path.exists():
        if user_id and USER_TEMPLATE_PATH.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(USER_TEMPLATE_PATH, path)
        elif (DATA / "config.json").exists() and user_id:
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(DATA / "config.json", path)
        else:
            write_json(path, default_config())
    config = read_json(path, default_config())
    changed = ensure_config_defaults(config)
    if changed:
        write_json(path, config)
    return config


def write_config(config, user_id=""):
    path = user_config_path(user_id) if user_id else DATA / "config.json"
    if not isinstance(config, dict):
        raise ValueError("配置格式错误。")
    ensure_config_defaults(config)
    write_json(path, config)


def read_user_template_config():
    if not USER_TEMPLATE_PATH.exists():
        write_json(USER_TEMPLATE_PATH, default_config())
    config = read_json(USER_TEMPLATE_PATH, default_config())
    if ensure_config_defaults(config):
        write_json(USER_TEMPLATE_PATH, config)
    return config


def write_user_template_config(config):
    if not isinstance(config, dict):
        raise ValueError("模板配置格式错误。")
    ensure_config_defaults(config)
    write_json(USER_TEMPLATE_PATH, config)


def reset_user_template_config():
    config = default_config()
    write_user_template_config(config)
    return read_user_template_config()


def copy_user_config_to_template(user_id):
    if not find_user_by_id(user_id):
        raise ValueError("用户不存在。")
    config = read_config(user_id)
    write_user_template_config(config)
    return read_user_template_config()


def should_sync_default_config(actor, user_id):
    if not actor or not is_super(actor):
        return False
    target = find_user_by_id(user_id)
    return bool(target and is_super(target))


def write_config_for_actor(config, user_id, actor):
    write_config(config, user_id)


def json_clone(value):
    return json.loads(json.dumps(value, ensure_ascii=False))


def exportable_config(config):
    cfg = json_clone(config if isinstance(config, dict) else {})
    cfg.pop("_sync", None)
    if not isinstance(cfg.get("app"), dict):
        cfg["app"] = {}
    if not isinstance(cfg.get("pages"), dict):
        cfg["pages"] = {}
    if not isinstance(cfg.get("toolbox_tabs"), list):
        cfg["toolbox_tabs"] = []
    if not isinstance(cfg.get("sidebar"), list):
        cfg["sidebar"] = []
    ensure_config_defaults(cfg)
    return cfg


def config_button_count(config):
    total = 0
    for page in (config.get("pages") or {}).values():
        if not isinstance(page, dict):
            continue
        for section in page.get("sections") or []:
            if isinstance(section, dict):
                total += len(section.get("buttons") or [])
    for tab in config.get("toolbox_tabs") or []:
        if not isinstance(tab, dict):
            continue
        for section in tab.get("sections") or []:
            if isinstance(section, dict):
                total += len(section.get("buttons") or [])
    return total


def config_summary(config):
    cfg = config if isinstance(config, dict) else {}
    return {
        "title": ((cfg.get("app") or {}).get("title") or "Toolbox"),
        "subtitle": ((cfg.get("app") or {}).get("subtitle") or ""),
        "pages": len(cfg.get("pages") or {}),
        "tabs": len(cfg.get("toolbox_tabs") or []),
        "buttons": config_button_count(cfg),
    }


def config_export_package(config, user=None, base_url=""):
    cfg = exportable_config(config)
    summary = config_summary(cfg)
    return {
        "format": "toolbox-config-export",
        "version": 1,
        "exportedAt": now_iso(),
        "title": summary["title"],
        "summary": summary,
        "source": {
            "userId": (user or {}).get("id", ""),
            "name": user_display_name(user or {}),
            "baseUrl": normalize_public_base_url(base_url) if base_url else "",
        },
        "config": cfg,
    }


def normalize_import_config(payload):
    if not isinstance(payload, dict):
        raise ValueError("导入内容必须是 JSON 对象。")
    config = payload.get("config") if isinstance(payload.get("config"), dict) else payload
    if not isinstance(config, dict):
        raise ValueError("导入配置格式错误。")
    if not any(key in config for key in ("app", "sidebar", "toolbox_tabs", "pages", "popup")):
        raise ValueError("没有识别到工具箱配置内容。")
    cfg = exportable_config(config)
    if "app" not in cfg or not isinstance(cfg.get("app"), dict):
        cfg["app"] = default_config()["app"]
    cfg.setdefault("sidebar", [])
    cfg.setdefault("toolbox_tabs", [])
    cfg.setdefault("pages", {})
    return cfg


def read_config_shares():
    data = read_json(CONFIG_SHARES_PATH, {"shares": {}})
    if not isinstance(data, dict):
        data = {"shares": {}}
    shares = data.get("shares")
    if not isinstance(shares, dict):
        data["shares"] = {}
    return data


def write_config_shares(data):
    if not isinstance(data, dict):
        data = {"shares": {}}
    data.setdefault("shares", {})
    write_json(CONFIG_SHARES_PATH, data)


def config_share_url(base_url, token):
    return f"{normalize_public_base_url(base_url).rstrip('/')}/api/public/config-share?token={quote(token)}"


def public_config_share(row, base_url="", include_config=True):
    config = exportable_config(row.get("config") or {})
    payload = {
        "format": "toolbox-config-export",
        "version": 1,
        "cloud": True,
        "shareToken": row.get("token", ""),
        "shareUrl": config_share_url(base_url, row.get("token", "")) if base_url and row.get("token") else "",
        "title": row.get("title") or config_summary(config)["title"],
        "createdAt": row.get("createdAt", ""),
        "source": {
            "userId": row.get("ownerUserId", ""),
            "name": row.get("ownerName", ""),
            "baseUrl": normalize_public_base_url(base_url) if base_url else row.get("baseUrl", ""),
        },
        "summary": config_summary(config),
    }
    if include_config:
        payload["config"] = config
    return payload


def create_config_share(config, user, base_url):
    token = random_hex(18)
    cfg = exportable_config(config)
    summary = config_summary(cfg)
    data = read_config_shares()
    data.setdefault("shares", {})[token] = {
        "token": token,
        "title": summary["title"],
        "ownerUserId": (user or {}).get("id", ""),
        "ownerName": user_display_name(user or {}),
        "baseUrl": normalize_public_base_url(base_url),
        "createdAt": now_iso(),
        "config": cfg,
    }
    write_config_shares(data)
    return public_config_share(data["shares"][token], base_url, include_config=False)


def read_config_share(token):
    token = (token or "").strip()
    if not token:
        raise ValueError("分享链接缺少 token。")
    row = (read_config_shares().get("shares") or {}).get(token)
    if not row:
        raise ValueError("分享链接不存在或已失效。")
    return row


def fetch_remote_config_payload(url):
    text = str(url or "").strip()
    parsed = urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("请填写 http 或 https 开头的云端链接。")
    req = urllib.request.Request(text, headers={"User-Agent": "ToolboxAdminConfigImporter/1.0", "Accept": "application/json"})
    limit = 3 * 1024 * 1024
    with urllib.request.urlopen(req, timeout=15) as resp:
        length = resp.headers.get("Content-Length")
        if length and int(length) > limit:
            raise ValueError("云端配置文件过大。")
        data = resp.read(limit + 1)
    if len(data) > limit:
        raise ValueError("云端配置文件过大。")
    try:
        return json.loads(data.decode("utf-8-sig"))
    except Exception as exc:
        raise ValueError(f"云端链接没有返回有效 JSON：{exc}")


def public_toolbox_config(user_id):
    cfg = read_config(user_id)
    app = cfg.setdefault("app", {})
    if app.get("password_enabled") is False:
        app["password"] = ""
    normalize_client_config(cfg)
    path = user_config_path(user_id)
    meta = dict(cfg.get("_sync") or {})
    meta["userId"] = user_id
    meta["updatedAt"] = int(path.stat().st_mtime) if path.exists() else int(time.time())
    cfg["_sync"] = meta
    return cfg


def normalize_client_config(cfg):
    inject_update_entry(cfg)

    def visible_buttons(buttons):
        return [button for button in buttons or [] if (button or {}).get("enabled", True) is not False]

    def normalize_button(button):
        if not isinstance(button, dict):
            return
        action = button.get("action", "link")
        target = get_target(button)
        if action == "download":
            button["download_url"] = target
            button.setdefault("url", target)
            button.setdefault("target", target)
        elif action == "script":
            button["script_id"] = target
            button.setdefault("script", target)
            if target not in SCRIPT_LABELS:
                button["custom_script"] = target
            button.setdefault("target", target)
        elif action == "cmd":
            button["command"] = target
            button.setdefault("target", target)
        elif action == "winget":
            button["package_id"] = target
            button.setdefault("winget", target)
            button.setdefault("package", target)
            button.setdefault("target", target)
        else:
            button["url"] = target
            button.setdefault("target", target)

    def normalize_sections(sections):
        for section in sections or []:
            if isinstance(section, dict):
                section["buttons"] = visible_buttons(section.get("buttons") or [])
            for button in (section or {}).get("buttons") or []:
                normalize_button(button)

    for page in (cfg.get("pages") or {}).values():
        normalize_sections((page or {}).get("sections") or [])
    for tab in cfg.get("toolbox_tabs") or []:
        normalize_sections((tab or {}).get("sections") or [])


def inject_update_entry(cfg):
    app = cfg.get("app") or {}
    update_url = (app.get("update_url") or app.get("client_update_url") or "").strip()
    if not update_url:
        return
    title = (app.get("update_title") or "工具箱更新").strip() or "工具箱更新"
    button_name = (app.get("update_button") or "下载最新版").strip() or "下载最新版"
    page_id = "__client_update"
    sidebar = cfg.setdefault("sidebar", [])
    sidebar[:] = [item for item in sidebar if item.get("id") != page_id]
    sidebar.insert(0, {"id": page_id, "name": title})
    pages = cfg.setdefault("pages", {})
    pages[page_id] = {
        "title": title,
        "sections": [{
            "title": "",
            "buttons": [{
                "id": "client_update_download",
                "name": button_name,
                "action": "download",
                "download_url": update_url,
                "url": update_url,
                "target": update_url,
                "description": "下载并安装最新版工具箱"
            }]
        }]
    }


def public_brand_config():
    app = read_config("").get("app", {})
    return {
        "title": app.get("admin_title") or DEFAULT_ADMIN_TITLE,
        "hint": app.get("login_hint") or DEFAULT_LOGIN_HINT,
        "icon": app.get("icon") or DEFAULT_APP_ICON,
        "logoText": app.get("logo_text") or "Y",
    }


def sync_public_brand_config(app_patch):
    keys = ("admin_title", "login_hint", "icon", "icon_url", "logo_text")
    if not any(key in app_patch for key in keys):
        return
    cfg = read_config("")
    app = cfg.setdefault("app", {})
    for key in keys:
        if key in app_patch:
            app[key] = app_patch[key]
    write_config(cfg, "")


def apply_app_patch(config, patch):
    app = config.setdefault("app", {})
    for key, value in patch.items():
        if key == "password_enabled" and not value:
            app["password_enabled"] = False
            app["password"] = ""
        elif key == "password_enabled":
            app["password_enabled"] = True
        elif key == "password" and value:
            app["password"] = stored_password(str(value))
        elif key == "default_view_mode":
            app[key] = normalize_view_mode(value, "grid")
        else:
            app[key] = value
    ensure_config_defaults(config)
    return config


def read_users():
    DATA.mkdir(parents=True, exist_ok=True)
    USER_DATA.mkdir(parents=True, exist_ok=True)
    store = read_json(USERS_PATH, {"users": [], "inviteCodes": []})
    store.setdefault("users", [])
    store.setdefault("inviteCodes", [])
    store.setdefault("settings", {})
    cleanup_invites(store)
    if not store["users"]:
        admin = {
            "id": "admin",
            "username": "admin",
            "displayName": "总管理员",
            "role": "super",
            "active": True,
            "canViewJson": True,
            "passwordHash": stored_password(ADMIN_TOKEN),
            "apiKey": random_hex(20),
            "createdAt": now_iso(),
        }
        store["users"] = [admin]
        write_json(USERS_PATH, store)
        write_config(read_config(""), "admin")
    return store


def write_users(store):
    store.setdefault("users", [])
    store.setdefault("inviteCodes", [])
    store.setdefault("settings", {})
    cleanup_invites(store)
    write_json(USERS_PATH, store)


def is_super(user):
    return user.get("role") == "super"


def is_agent(user):
    return user.get("role") == "agent"


def can_manage_users(user):
    return is_super(user) or is_agent(user)


def role_label(role):
    return {"super": "总管理员", "agent": "代理", "user": "普通用户"}.get(role, "普通用户")


def is_login_api_path(path):
    normalized = "/" + str(path or "").strip("/").lower()
    return normalized in ("/api/login", "/desktop/login") or normalized.endswith("/api/login") or normalized.endswith("/desktop/login")


def handle_desktop_login(handler):
    body = handler.read_body()
    user = find_user_by_username((body.get("username") or "").strip())
    if not user or user.get("active", True) is False or not check_password(str(body.get("password") or ""), user.get("passwordHash", "")):
        return handler.send_json({"error": "用户名或密码错误。"}, 401)
    token = random_hex(32)
    user = mark_user_login(user["id"])
    SESSIONS[token] = {"userId": user["id"], "createdAt": now_iso()}
    save_sessions()
    return handler.send_json({"token": token, "user": public_user(user)})


def default_system_settings():
    return {
        "locations": {
            "noticeAreaTitle": "全部未读",
            "adminSystemName": "系统管理",
            "frontendActiveGlow": True,
            "frontendShowGroupCount": True,
        },
        "agent": {
            "invitePrice": 0,
            "currency": "CNY",
            "allowNegativeBalance": False,
            "orderCooldownMinutes": 30,
            "allowApply": False,
            "applyReviewMode": "manual",
            "defaultBalance": 0,
            "applyDescription": "",
        },
        "pay": {
            "wechatChannel": "disabled",
            "alipayChannel": "disabled",
            "wechatOrder": 10,
            "alipayOrder": 20,
            "easypay": {"enabled": False, "name": "", "apiUrl": "", "pid": "", "key": "", "notifyUrl": "", "returnUrl": "", "pcScan": False},
            "easypay2": {"enabled": False, "name": "", "apiUrl": "", "pid": "", "key": "", "notifyUrl": "", "returnUrl": "", "pcScan": False},
            "alipayOfficial": {"enabled": False, "appId": "", "privateKey": "", "publicKey": "", "gateway": "", "notifyUrl": "", "returnUrl": ""},
            "wechatOfficial": {"enabled": False, "mchId": "", "appId": "", "apiV3Key": "", "serialNo": "", "privateKey": "", "notifyUrl": ""},
        },
        "clientBuild": {
            "cacheRetentionHours": 24,
            "jobRetentionHours": 24,
            "cleanupIntervalMinutes": 360,
            "maxCacheEntries": 30,
        },
        "integrity": {
            "enabled": True,
            "secret": "",
            "tokenTtlMinutes": 10080,
            "lockBuildAfterFirstIssue": False,
        },
    }


def http_url(value):
    text = str(value or "").strip()
    return text if text.lower().startswith(("http://", "https://")) else ""


def popup_image_url(value):
    text = str(value or "").strip()
    return text if text.lower().startswith(("http://", "https://")) else ""


def popup_abs_url(value, base_url):
    text = str(value or "").strip()
    if text.lower().startswith(("http://", "https://")):
        return text
    if text.startswith("/"):
        return base_url.rstrip("/") + text
    return text


def popup_int(value, fallback, minimum=0, maximum=9999):
    try:
        return max(minimum, min(maximum, int(value)))
    except Exception:
        return fallback


def normalize_popup_qr_items(items):
    rows = []
    if not isinstance(items, list):
        return rows
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        row = {
            "title": str(item.get("title") or "").strip(),
            "description": str(item.get("description") or "").strip(),
            "image": popup_image_url(item.get("image")),
            "enabled": item.get("enabled", True) is not False,
            "sort": popup_int(item.get("sort"), index + 1, -999999, 999999),
            "buttonText": str(item.get("buttonText") or "").strip(),
            "buttonUrl": http_url(item.get("buttonUrl")),
        }
        rows.append(row)
    return rows


def normalize_popup_links(items):
    rows = []
    if not isinstance(items, list):
        return rows
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        row = {
            "title": str(item.get("title") or item.get("name") or "").strip(),
            "description": str(item.get("description") or "").strip(),
            "url": http_url(item.get("url")),
            "buttonText": str(item.get("buttonText") or "打开链接").strip() or "打开链接",
            "enabled": item.get("enabled", True) is not False,
            "sort": popup_int(item.get("sort"), index + 1, -999999, 999999),
        }
        rows.append(row)
    return rows


def normalize_popup_settings(value):
    default = default_popup_settings()
    popup = value if isinstance(value, dict) else {}
    normalized = {
        "enabled": popup.get("enabled", default["enabled"]) is True,
        "clickCount": popup_int(popup.get("clickCount"), default["clickCount"], 1, 20),
        "title": str(popup.get("title") or default["title"]).strip() or default["title"],
        "thanksText": str(popup.get("thanksText") or default["thanksText"]).strip() or default["thanksText"],
        "cacheMinutes": popup_int(popup.get("cacheMinutes"), default["cacheMinutes"], 0, 1440),
        "contacts": normalize_popup_qr_items(popup.get("contacts")),
        "payments": normalize_popup_qr_items(popup.get("payments")),
        "links": normalize_popup_links(popup.get("links")),
    }
    return normalized


def public_popup_config(user_id, base_url):
    popup = normalize_popup_settings(read_config(user_id).get("popup") or {})
    def public_qr_rows(rows):
        result = []
        for row in sorted([x for x in rows if x.get("enabled")], key=lambda x: (x.get("sort", 0), x.get("title", ""))):
            result.append({
                "title": row.get("title") or "",
                "description": row.get("description") or "",
                "image": popup_abs_url(row.get("image") or "", base_url),
                "enabled": True,
                "sort": row.get("sort", 0),
                "buttonText": row.get("buttonText") or "",
                "buttonUrl": row.get("buttonUrl") or "",
            })
        return result

    links = []
    for row in sorted([x for x in popup.get("links", []) if x.get("enabled") and x.get("url")], key=lambda x: (x.get("sort", 0), x.get("title", ""))):
        links.append({
            "title": row.get("title") or "",
            "description": row.get("description") or "",
            "url": row.get("url") or "",
            "buttonText": row.get("buttonText") or "打开链接",
            "enabled": True,
            "sort": row.get("sort", 0),
        })
    cache_minutes = popup_int(popup.get("cacheMinutes"), 60, 0, 1440)
    return {
        "enabled": popup.get("enabled") is True,
        "clickCount": popup_int(popup.get("clickCount"), 3, 1, 20),
        "title": popup.get("title") or "联系我们 / 支持作者",
        "thanksText": popup.get("thanksText") or "",
        "cacheMinutes": cache_minutes,
        "cacheSeconds": cache_minutes * 60,
        "contacts": public_qr_rows(popup.get("contacts", [])),
        "payments": public_qr_rows(popup.get("payments", [])),
        "links": links,
    }


def read_system_settings():
    data = read_json(SYSTEM_PATH, default_system_settings())
    defaults = default_system_settings()
    changed = False
    for key, value in defaults.items():
        if isinstance(value, dict):
            if key not in data or not isinstance(data.get(key), dict):
                data[key] = {}
                changed = True
            for sub_key, sub_value in value.items():
                if isinstance(sub_value, dict):
                    if sub_key not in data[key] or not isinstance(data[key].get(sub_key), dict):
                        data[key][sub_key] = {}
                        changed = True
                    for item_key, item_value in sub_value.items():
                        if item_key not in data[key][sub_key]:
                            data[key][sub_key][item_key] = item_value
                            changed = True
                else:
                    if sub_key not in data[key]:
                        data[key][sub_key] = sub_value
                        changed = True
        else:
            if key not in data:
                data[key] = value
                changed = True
    pay = data.get("pay") or {}
    for selected_key in (pay.get("wechatChannel"), pay.get("alipayChannel")):
        if selected_key and selected_key != "disabled" and isinstance(pay.get(selected_key), dict):
            pay[selected_key].setdefault("enabled", True)
    if "popup" in data:
        data.pop("popup", None)
        changed = True
    integrity = data.setdefault("integrity", {})
    if len(str(integrity.get("secret") or "").strip()) < 32:
        integrity["secret"] = random_hex(24)
        changed = True
    if changed:
        write_json(SYSTEM_PATH, data)
    return data


def public_system_settings():
    data = read_system_settings()
    public = json.loads(json.dumps(data, ensure_ascii=False))
    public.pop("popup", None)
    public.setdefault("agent", {})["pendingApplyCount"] = agent_pending_application_count()
    if isinstance(public.get("integrity"), dict):
        public["integrity"]["secret"] = ""
        public["integrity"]["secretConfigured"] = True
    return public


def write_system_settings(body):
    current = read_system_settings()
    for section in ("locations", "agent", "pay", "integrity", "clientBuild"):
        patch = body.get(section)
        if not isinstance(patch, dict):
            continue
        if section == "integrity":
            current.setdefault("integrity", {})
            if "enabled" in patch:
                current["integrity"]["enabled"] = patch.get("enabled") is not False
            if "tokenTtlMinutes" in patch:
                try:
                    current["integrity"]["tokenTtlMinutes"] = max(5, min(43200, int(patch.get("tokenTtlMinutes") or 10080)))
                except Exception:
                    current["integrity"]["tokenTtlMinutes"] = 10080
            if "lockBuildAfterFirstIssue" in patch:
                current["integrity"]["lockBuildAfterFirstIssue"] = patch.get("lockBuildAfterFirstIssue") is not False
            if patch.get("rotateSecret"):
                current["integrity"]["secret"] = random_hex(24)
            continue
        if section == "clientBuild":
            current.setdefault("clientBuild", {})
            if "cacheRetentionHours" in patch:
                try:
                    current["clientBuild"]["cacheRetentionHours"] = max(1, min(24 * 30, int(patch.get("cacheRetentionHours") or 24)))
                except Exception:
                    current["clientBuild"]["cacheRetentionHours"] = 24
            if "jobRetentionHours" in patch:
                try:
                    current["clientBuild"]["jobRetentionHours"] = max(1, min(24 * 30, int(patch.get("jobRetentionHours") or 24)))
                except Exception:
                    current["clientBuild"]["jobRetentionHours"] = 24
            if "cleanupIntervalMinutes" in patch:
                try:
                    current["clientBuild"]["cleanupIntervalMinutes"] = max(10, min(24 * 60, int(patch.get("cleanupIntervalMinutes") or 360)))
                except Exception:
                    current["clientBuild"]["cleanupIntervalMinutes"] = 360
            if "maxCacheEntries" in patch:
                try:
                    current["clientBuild"]["maxCacheEntries"] = max(1, min(200, int(patch.get("maxCacheEntries") or 30)))
                except Exception:
                    current["clientBuild"]["maxCacheEntries"] = 30
            continue
        for key, value in patch.items():
            if isinstance(current.get(section, {}).get(key), dict) and isinstance(value, dict):
                current[section][key].update(value)
            else:
                current.setdefault(section, {})[key] = value
    try:
        current["agent"]["invitePrice"] = max(0, float(current.get("agent", {}).get("invitePrice") or 0))
    except Exception:
        current["agent"]["invitePrice"] = 0
    try:
        current["agent"]["orderCooldownMinutes"] = max(0, int(current.get("agent", {}).get("orderCooldownMinutes") or 0))
    except Exception:
        current["agent"]["orderCooldownMinutes"] = 30
    current.setdefault("agent", {})
    current["agent"]["allowApply"] = current["agent"].get("allowApply") is True
    current["agent"]["applyReviewMode"] = "auto" if current["agent"].get("applyReviewMode") == "auto" else "manual"
    try:
        current["agent"]["defaultBalance"] = max(0, float(current["agent"].get("defaultBalance") or 0))
    except Exception:
        current["agent"]["defaultBalance"] = 0
    current["agent"]["applyDescription"] = str(current["agent"].get("applyDescription") or "").strip()
    current["agent"]["currency"] = str(current["agent"].get("currency") or "CNY").strip()[:12] or "CNY"
    pay = current.setdefault("pay", {})
    for selected_key in (pay.get("wechatChannel"), pay.get("alipayChannel")):
        if selected_key and selected_key != "disabled" and isinstance(pay.get(selected_key), dict):
            pay[selected_key].setdefault("enabled", True)
    write_json(SYSTEM_PATH, current)
    return public_system_settings()


def read_notices():
    data = read_json(NOTICES_PATH, {"notices": [], "reads": {}})
    data.setdefault("notices", [])
    data.setdefault("reads", {})
    return data


def write_notices(data):
    data.setdefault("notices", [])
    data.setdefault("reads", {})
    write_json(NOTICES_PATH, data)


def read_orders():
    data = read_json(ORDERS_PATH, {"orders": []})
    data.setdefault("orders", [])
    return data


def write_orders(data):
    data.setdefault("orders", [])
    write_json(ORDERS_PATH, data)


def read_agent_applications():
    data = read_json(AGENT_APPLICATIONS_PATH, {"applications": []})
    data.setdefault("applications", [])
    return data


def write_agent_applications(data):
    data.setdefault("applications", [])
    write_json(AGENT_APPLICATIONS_PATH, data)


def read_agent_logs():
    data = read_json(AGENT_LOGS_PATH, {"logs": []})
    data.setdefault("logs", [])
    return data


def write_agent_logs(data):
    data.setdefault("logs", [])
    write_json(AGENT_LOGS_PATH, data)


def log_agent_action(action, user, actor=None, detail=""):
    try:
        data = read_agent_logs()
        data["logs"].insert(0, {
            "id": new_id("agentlog"),
            "action": action,
            "userId": user.get("id") if user else "",
            "username": user.get("username") if user else "",
            "displayName": user_display_name(user),
            "actorId": actor.get("id") if actor else "system",
            "actorName": user_display_name(actor) if actor else "系统",
            "detail": detail,
            "createdAt": now_iso(),
        })
        data["logs"] = data["logs"][:1000]
        write_agent_logs(data)
    except Exception:
        pass


def agent_application_status_label(status):
    return {"pending": "待审核", "approved": "已通过", "rejected": "已拒绝"}.get(status, "待审核")


def public_agent_application(row):
    user = find_user_by_id(row.get("userId", "")) if row.get("userId") else None
    reviewer = find_user_by_id(row.get("reviewerId", "")) if row.get("reviewerId") else None
    return {
        "id": row.get("id"),
        "userId": row.get("userId", ""),
        "username": row.get("username") or (user or {}).get("username", ""),
        "displayName": row.get("displayName") or user_display_name(user),
        "contact": row.get("contact", ""),
        "reason": row.get("reason", ""),
        "status": row.get("status", "pending"),
        "statusLabel": agent_application_status_label(row.get("status", "pending")),
        "rejectReason": row.get("rejectReason", ""),
        "reviewerId": row.get("reviewerId", ""),
        "reviewerName": row.get("reviewerName") or user_display_name(reviewer),
        "reviewedAt": row.get("reviewedAt", ""),
        "createdAt": row.get("createdAt", ""),
        "updatedAt": row.get("updatedAt", ""),
    }


def agent_pending_application_count():
    try:
        return sum(1 for row in read_agent_applications().get("applications", []) if row.get("status") == "pending")
    except Exception:
        return 0


def latest_agent_application_for_user(user_id):
    rows = [
        row for row in read_agent_applications().get("applications", [])
        if row.get("userId") == user_id
    ]
    rows.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return rows[0] if rows else None


def agent_stats_from_store(store, agent_id):
    invites = store.get("inviteCodes", [])
    users = store.get("users", [])
    return {
        "agentInviteCount": sum(1 for invite in invites if invite.get("ownerAgentId") == agent_id or invite.get("boundAgentId") == agent_id),
        "promotedUserCount": sum(1 for user in users if user.get("parentAgentId") == agent_id),
    }


def promote_user_to_agent(user_id, actor=None, use_default_balance=True, balance=None, detail=""):
    store = read_users()
    user = next((u for u in store.get("users", []) if u.get("id") == user_id), None)
    if not user:
        raise ValueError("用户不存在。")
    if user.get("role") == "super":
        raise ValueError("总管理员不需要设置为代理。")
    settings = read_system_settings()
    agent_settings = settings.get("agent") or {}
    user["role"] = "agent"
    user["parentAgentId"] = ""
    if balance is not None:
        user["balance"] = float(balance or 0)
    elif use_default_balance:
        user["balance"] = float(agent_settings.get("defaultBalance") or 0)
    else:
        user["balance"] = float(user.get("balance") or 0)
    user["updatedAt"] = now_iso()
    write_users(store)
    log_agent_action("promote", user, actor, detail or "设置为代理")
    return user


def cancel_user_agent(user_id, actor=None, detail=""):
    store = read_users()
    user = next((u for u in store.get("users", []) if u.get("id") == user_id), None)
    if not user:
        raise ValueError("用户不存在。")
    if user.get("role") != "agent":
        raise ValueError("该用户当前不是代理。")
    user["role"] = "user"
    user["updatedAt"] = now_iso()
    write_users(store)
    log_agent_action("cancel", user, actor, detail or "取消代理身份")
    return user


def public_agent_apply_state(user):
    settings = read_system_settings()
    agent_settings = settings.get("agent") or {}
    latest = latest_agent_application_for_user(user.get("id"))
    return {
        "allowApply": agent_settings.get("allowApply") is True,
        "reviewMode": agent_settings.get("applyReviewMode") or "manual",
        "description": agent_settings.get("applyDescription") or "",
        "defaultBalance": agent_settings.get("defaultBalance") or 0,
        "currency": agent_settings.get("currency") or "CNY",
        "isAgent": is_agent(user),
        "balance": user.get("balance", 0),
        "application": public_agent_application(latest) if latest else None,
    }


def submit_agent_application(user, body):
    if is_super(user):
        raise ValueError("总管理员不需要申请代理。")
    if is_agent(user):
        raise ValueError("你已经是代理，不能重复申请。")
    settings = read_system_settings()
    agent_settings = settings.get("agent") or {}
    if agent_settings.get("allowApply") is not True:
        raise ValueError("当前未开放代理申请。")
    latest = latest_agent_application_for_user(user.get("id"))
    if latest and latest.get("status") == "pending":
        raise ValueError("已有待审核申请，请等待审核。")
    contact = str(body.get("contact") or "").strip()
    reason = str(body.get("reason") or "").strip()
    if not contact:
        raise ValueError("请填写联系方式。")
    if not reason:
        raise ValueError("请填写申请理由。")

    data = read_agent_applications()
    row = {
        "id": new_id("agentapply"),
        "userId": user.get("id"),
        "username": user.get("username"),
        "displayName": user_display_name(user),
        "contact": contact,
        "reason": reason,
        "status": "pending",
        "rejectReason": "",
        "reviewerId": "",
        "reviewerName": "",
        "reviewedAt": "",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }

    if agent_settings.get("applyReviewMode") == "auto":
        promoted = promote_user_to_agent(user.get("id"), None, True, None, "代理申请自动通过")
        row["status"] = "approved"
        row["reviewerId"] = "system"
        row["reviewerName"] = "系统"
        row["reviewedAt"] = now_iso()
        row["updatedAt"] = row["reviewedAt"]
        data["applications"].insert(0, row)
        write_agent_applications(data)
        return public_agent_application(row), public_user(promoted), True

    data["applications"].insert(0, row)
    write_agent_applications(data)
    try:
        send_admin_event_email("代理申请待审核", f"用户 {user_display_name(user)} 提交了代理申请。联系方式：{contact}\n申请理由：{reason}")
    except Exception:
        pass
    return public_agent_application(row), public_user(user), False


def review_agent_application(application_id, status, reviewer, reject_reason=""):
    if status not in ("approved", "rejected"):
        raise ValueError("不支持的审核状态。")
    data = read_agent_applications()
    row = next((x for x in data.get("applications", []) if x.get("id") == application_id), None)
    if not row:
        raise ValueError("代理申请不存在。")
    if row.get("status") != "pending":
        raise ValueError("该申请已经审核过，不能重复审核。")
    user = find_user_by_id(row.get("userId"))
    if not user:
        raise ValueError("申请用户不存在。")
    row["status"] = status
    row["reviewerId"] = reviewer.get("id")
    row["reviewerName"] = user_display_name(reviewer)
    row["reviewedAt"] = now_iso()
    row["updatedAt"] = row["reviewedAt"]
    if status == "rejected":
        row["rejectReason"] = str(reject_reason or "").strip()
    else:
        promoted = promote_user_to_agent(user.get("id"), reviewer, True, None, f"通过代理申请 {application_id}")
        row["username"] = promoted.get("username")
        row["displayName"] = user_display_name(promoted)
    write_agent_applications(data)
    close_agent_application_notice(application_id)
    return public_agent_application(row)


def public_order(order):
    return {
        "id": order.get("id"),
        "status": order.get("status", "pending"),
        "action": order.get("action", ""),
        "amount": order.get("amount", 0),
        "currency": order.get("currency", "CNY"),
        "agentId": order.get("agentId", ""),
        "agentUsername": order.get("agentUsername", ""),
        "agentDisplayName": order.get("agentDisplayName") or find_user_display_name(order.get("agentId", ""), order.get("agentUsername", "")),
        "detail": localized_order_detail(order),
        "request": order.get("request") or {},
        "paymentMethod": order.get("paymentMethod", ""),
        "paymentChannel": order.get("paymentChannel", ""),
        "fulfilledAt": order.get("fulfilledAt", ""),
        "fulfilledInviteCodes": order.get("fulfilledInviteCodes") or [],
        "createdAt": order.get("createdAt", ""),
        "updatedAt": order.get("updatedAt", ""),
    }


def localized_order_detail(order):
    request = order.get("request") or {}
    if order.get("action") == "create_invites" and request:
        return order_detail_for_invites(request)
    detail = str(order.get("detail") or "")
    if detail.startswith("Create ") and "invite code" in detail:
        try:
            count = detail.split("Create ", 1)[1].split(" invite", 1)[0]
            max_uses = detail.split("maxUses=", 1)[1].split(",", 1)[0]
            retention_days = detail.split("retentionDays=", 1)[1].split(",", 1)[0]
            return f"生成 {count} 个邀请码，可用次数 {max_uses}，使用后保留 {retention_days} 天"
        except Exception:
            return "生成邀请码"
    return detail


def localized_notice_title(title):
    mapping = {
        "Agent order pending": "代理订单待处理",
        "Agent invite order fulfilled": "代理邀请码订单已通过",
        "Agent invite created": "代理邀请码已生成",
    }
    return mapping.get(title, title)


def localized_notice_content(content):
    text = str(content or "")
    if text.startswith("Agent ") and " created order " in text:
        try:
            username = text.split("Agent ", 1)[1].split(" created order ", 1)[0]
            rest = text.split(" created order ", 1)[1]
            order_id = rest.split(":", 1)[0]
            amount = rest.split("Amount:", 1)[1].strip().rstrip(".")
            return f"代理 {username} 提交了订单 {order_id}，金额：{amount}。"
        except Exception:
            return "代理提交了新订单。"
    if text.startswith("Super admin ") and " approved order " in text:
        try:
            approver = text.split("Super admin ", 1)[1].split(" approved order ", 1)[0]
            rest = text.split(" approved order ", 1)[1]
            order_id = rest.split(" for agent ", 1)[0]
            agent = rest.split(" for agent ", 1)[1].split(";", 1)[0]
            created = rest.split("created ", 1)[1].split(" invite", 1)[0]
            amount = rest.split("Amount:", 1)[1].strip().rstrip(".")
            return f"总管理员 {approver} 已通过代理 {agent} 的订单 {order_id}，生成 {created} 个邀请码，金额：{amount}。"
        except Exception:
            return "总管理员已通过代理订单并生成邀请码。"
    if text.startswith("Agent ") and " invite code(s). Amount: " in text:
        try:
            username = text.split("Agent ", 1)[1].split(" created ", 1)[0]
            count = text.split(" created ", 1)[1].split(" invite", 1)[0]
            amount = text.split("Amount:", 1)[1].strip().rstrip(".")
            return f"代理 {username} 已生成 {count} 个邀请码，金额：{amount}。"
        except Exception:
            return "代理已生成邀请码。"
    return text


def public_notice(notice, user_id=""):
    created_by = notice.get("createdBy", "")
    created_by_name = notice.get("createdByName") or ("系统" if created_by == "system" else find_user_display_name(notice.get("createdById", ""), created_by))
    return {
        "id": notice.get("id"),
        "title": localized_notice_title(notice.get("title", "")),
        "content": localized_notice_content(notice.get("content", "")),
        "level": notice.get("level", "info"),
        "createdAt": notice.get("createdAt", ""),
        "createdBy": created_by_name,
        "createdByUsername": "" if created_by == "system" else created_by,
        "createdById": notice.get("createdById", ""),
        "read": user_id in set(notice.get("readBy") or []),
        "refType": notice.get("refType", ""),
        "refId": notice.get("refId", ""),
    }


def notice_visible_to_user(notice, user):
    if notice.get("targetRole") == "super" and not is_super(user):
        return False
    return notice.get("active", True) is not False


def add_system_notice(title, content, level="info", target_role="", ref_type="", ref_id=""):
    data = read_notices()
    notice = {
        "id": new_id("notice"),
        "title": title,
        "content": content,
        "level": level,
        "targetRole": target_role,
        "active": True,
        "createdAt": now_iso(),
        "createdBy": "system",
        "createdById": "system",
        "readBy": [],
        "refType": ref_type,
        "refId": ref_id,
    }
    data["notices"].insert(0, notice)
    write_notices(data)
    return notice


def close_agent_application_notice(application_id):
    if not application_id:
        return
    try:
        data = read_notices()
        changed = False
        for notice in data.get("notices", []):
            if notice.get("refType") == "agentApplication" and notice.get("refId") == application_id and notice.get("title") == "代理申请待审核":
                notice["active"] = False
                changed = True
        if changed:
            write_notices(data)
    except Exception:
        pass


def scoped_users(store, actor):
    users = store.get("users", [])
    if is_super(actor):
        return users
    if is_agent(actor):
        own = actor.get("id")
        return [u for u in users if u.get("id") == own or u.get("parentAgentId") == own]
    return [actor]


def assert_user_scope(actor, target_id):
    if is_super(actor):
        return
    target = find_user_by_id(target_id)
    if not target:
        raise ValueError("用户不存在。")
    if is_agent(actor) and target.get("parentAgentId") == actor.get("id"):
        return
    if target.get("id") == actor.get("id"):
        return
    raise PermissionError("没有权限管理这个用户。")


def cleanup_invites(store):
    try:
        keep = []
        now_ts = time.time()
        default_days = int((store.get("settings") or {}).get("inviteRetentionDays") or 7)
        for invite in store.get("inviteCodes", []):
            used = int(invite.get("usedCount") or 0)
            max_uses = int(invite.get("maxUses") or 1)
            days = int(invite.get("retentionDays") or default_days)
            if used > 0 and max_uses > 0 and used >= max_uses and days >= 0:
                used_at = ""
                if invite.get("usedBy"):
                    used_at = invite.get("usedBy", [{}])[-1].get("usedAt", "")
                try:
                    used_ts = time.mktime(time.strptime(used_at[:19], "%Y-%m-%dT%H:%M:%S"))
                except Exception:
                    used_ts = now_ts
                if now_ts - used_ts >= days * 86400:
                    continue
            keep.append(invite)
        store["inviteCodes"] = keep
    except Exception:
        return


def default_mail_settings():
    return {"host": "", "port": 465, "user": "", "password": "", "from": "", "secure": True}


def read_mail_settings():
    settings = read_json(MAIL_PATH, default_mail_settings())
    defaults = default_mail_settings()
    defaults.update(settings or {})
    return defaults


def public_mail_settings():
    settings = read_mail_settings()
    return {
        "host": settings.get("host", ""),
        "port": settings.get("port", 465),
        "user": settings.get("user", ""),
        "from": settings.get("from", ""),
        "secure": bool(settings.get("secure", True)),
        "hasPassword": bool(settings.get("password"))
    }


def write_mail_settings(body):
    current = read_mail_settings()
    current["host"] = (body.get("host") or "").strip()
    current["port"] = int(body.get("port") or 465)
    current["user"] = (body.get("user") or "").strip()
    current["from"] = (body.get("from") or current["user"]).strip()
    current["secure"] = bool(body.get("secure", True))
    if body.get("password"):
        current["password"] = body.get("password")
    elif body.get("clearPassword"):
        current["password"] = ""
    write_json(MAIL_PATH, current)
    return current


def public_user(user, store=None):
    if not user:
        return None
    data = {
        "id": user.get("id"),
        "username": user.get("username"),
        "email": user.get("email", ""),
        "displayName": user.get("displayName"),
        "role": user.get("role"),
        "roleLabel": role_label(user.get("role")),
        "active": user.get("active", True),
        "canViewJson": user.get("canViewJson", user.get("role") == "super"),
        "parentAgentId": user.get("parentAgentId", ""),
        "balance": user.get("balance", 0),
        "apiKey": user.get("apiKey"),
        "createdAt": user.get("createdAt", ""),
        "lastLoginAt": user.get("lastLoginAt", ""),
    }
    if user.get("parentAgentId"):
        parent = find_user_by_id(user.get("parentAgentId"))
        data["parentAgentName"] = user.get("parentAgentName") or user_display_name(parent)
    if user.get("role") == "agent":
        stats = agent_stats_from_store(store or read_users(), user.get("id"))
        data.update(stats)
    latest_apply = latest_agent_application_for_user(user.get("id"))
    if latest_apply:
        data["agentApplication"] = public_agent_application(latest_apply)
    return data


def find_user_by_id(user_id):
    return next((u for u in read_users()["users"] if u.get("id") == user_id), None)


def find_user_by_username(username):
    return next((u for u in read_users()["users"] if u.get("username") == username), None)


def mark_user_login(user_id):
    store = read_users()
    login_at = now_iso()
    for row in store["users"]:
        if row.get("id") == user_id:
            row["lastLoginAt"] = login_at
            write_users(store)
            return row
    return find_user_by_id(user_id)


def find_user_by_api_key(key):
    if not key:
        return None
    return next((u for u in read_users()["users"] if u.get("apiKey") == key and u.get("active", True) is not False), None)


def find_user_by_email(email):
    email = (email or "").strip().lower()
    if not email:
        return None
    return next((u for u in read_users()["users"] if (u.get("email") or "").strip().lower() == email), None)


def normalize_role(role):
    return role if role in ("super", "agent", "user") else "user"


def create_user(username, password, display_name="", role="user", template_user=None, email="", parent_agent_id="", balance=0):
    username = (username or "").strip()
    email = (email or "").strip().lower()
    password = password or ""
    display_name = (display_name or username).strip() or username
    role = normalize_role(role)
    if not username or not password:
        raise ValueError("用户名和密码不能为空。")
    if find_user_by_username(username):
        raise ValueError("用户名已存在。")
    if email and find_user_by_email(email):
        raise ValueError("邮箱已存在。")
    base = safe_id(username)
    user_id = base
    while find_user_by_id(user_id):
        user_id = f"{base}-{int(time.time() * 1000)}"
    parent_agent = find_user_by_id(parent_agent_id) if parent_agent_id and role == "user" else None
    user = {
        "id": user_id,
        "username": username,
        "email": email,
        "displayName": display_name,
        "role": role,
        "active": True,
        "canViewJson": role == "super",
        "parentAgentId": parent_agent_id if role == "user" else "",
        "parentAgentName": user_display_name(parent_agent) if parent_agent else "",
        "balance": float(balance or 0) if role == "agent" else 0,
        "passwordHash": stored_password(password),
        "apiKey": random_hex(20),
        "createdAt": now_iso(),
    }
    store = read_users()
    store["users"].append(user)
    write_users(store)
    template_config = read_config(template_user["id"]) if template_user else read_user_template_config()
    write_config(template_config, user_id)
    return user


def smtp_ready():
    settings = read_mail_settings()
    return bool((settings.get("host") or os.environ.get("SMTP_HOST")) and
                (settings.get("user") or os.environ.get("SMTP_USER")) and
                (settings.get("password") or os.environ.get("SMTP_PASS")))


def send_reset_email(email, code):
    if not smtp_ready():
        return False
    msg = EmailMessage()
    settings = read_mail_settings()
    sender = settings.get("from") or settings.get("user") or os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER")
    msg["From"] = sender
    msg["To"] = email
    msg["Subject"] = "工具箱后台密码找回验证码"
    msg.set_content("你的密码找回验证码是：%s\n验证码 10 分钟内有效。" % code)
    host = settings.get("host") or os.environ.get("SMTP_HOST")
    port = int(settings.get("port") or os.environ.get("SMTP_PORT", "465"))
    user = settings.get("user") or os.environ.get("SMTP_USER")
    password = settings.get("password") or os.environ.get("SMTP_PASS")
    if settings.get("secure", True) or port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
            smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)
    return True


def send_admin_event_email(subject, content):
    if not smtp_ready():
        return False
    store = read_users()
    recipients = [
        (u.get("email") or "").strip()
        for u in store.get("users", [])
        if is_super(u) and (u.get("email") or "").strip()
    ]
    if not recipients:
        return False
    settings = read_mail_settings()
    sender = settings.get("from") or settings.get("user") or os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER")
    host = settings.get("host") or os.environ.get("SMTP_HOST")
    port = int(settings.get("port") or os.environ.get("SMTP_PORT", "465"))
    user = settings.get("user") or os.environ.get("SMTP_USER")
    password = settings.get("password") or os.environ.get("SMTP_PASS")
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(content)
    if settings.get("secure", True) or port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
            smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)
    return True


def send_notice_mail_to_users(notice, users=None):
    if not smtp_ready():
        return False, "未配置邮箱服务器。"
    pool = users if users is not None else read_users().get("users", [])
    recipients = []
    for user in pool:
        email = (user.get("email") or "").strip()
        if email and email not in recipients:
            recipients.append(email)
    if not recipients:
        return False, "没有可接收邮箱的用户。"
    settings = read_mail_settings()
    sender = settings.get("from") or settings.get("user") or os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER")
    host = settings.get("host") or os.environ.get("SMTP_HOST")
    port = int(settings.get("port") or os.environ.get("SMTP_PORT", "465"))
    user = settings.get("user") or os.environ.get("SMTP_USER")
    password = settings.get("password") or os.environ.get("SMTP_PASS")
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = notice.get("title") or "通知"
    msg.set_content(notice.get("content") or "")
    if settings.get("secure", True) or port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
            smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)
    return True, f"已推送到 {len(recipients)} 个邮箱。"


PAYMENT_CHANNEL_LABELS = {
    "easypay": "易支付一",
    "easypay2": "易支付二",
    "alipayOfficial": "支付宝官方",
    "wechatOfficial": "微信企业支付",
}


def configured_payment_channels(settings):
    pay = settings.get("pay") or {}
    channels = []
    for selected_key in (pay.get("wechatChannel"), pay.get("alipayChannel")):
        if not selected_key or selected_key == "disabled" or selected_key in channels:
            continue
        gateway = pay.get(selected_key) or {}
        if gateway.get("enabled") is not True:
            continue
        if selected_key in ("easypay", "easypay2"):
            ready = gateway.get("apiUrl") and gateway.get("pid") and gateway.get("key")
        elif selected_key == "alipayOfficial":
            ready = gateway.get("appId") and gateway.get("privateKey") and gateway.get("gateway")
        elif selected_key == "wechatOfficial":
            ready = gateway.get("mchId") and gateway.get("appId") and gateway.get("apiV3Key")
        else:
            ready = False
        if ready:
            channels.append(selected_key)
    return channels


def public_payment_channels(settings):
    return [{"key": key, "label": PAYMENT_CHANNEL_LABELS.get(key, key)} for key in configured_payment_channels(settings)]


def recent_pending_order(agent_id, action, cooldown_minutes, data=None):
    if cooldown_minutes <= 0:
        return None
    try:
        cutoff = time.time() - cooldown_minutes * 60
        data = data or read_orders()
        for order in data.get("orders", []):
            if order.get("agentId") != agent_id or order.get("action") != action or order.get("status") != "pending":
                continue
            try:
                created = time.mktime(time.strptime((order.get("createdAt") or "")[:19], "%Y-%m-%dT%H:%M:%S"))
            except Exception:
                created = time.time()
            if created >= cutoff:
                return order
    except Exception:
        return None
    return None


def create_admin_order(agent, action, amount, currency, detail, request=None, payment_method="", payment_channel=""):
    settings = read_system_settings()
    cooldown = int((settings.get("agent") or {}).get("orderCooldownMinutes") or 0)
    data = read_orders()
    existing = recent_pending_order(agent.get("id"), action, cooldown, data)
    if existing:
        existing["amount"] = round(float(amount or 0), 2)
        existing["currency"] = currency or "CNY"
        existing["detail"] = detail
        existing["request"] = request or {}
        existing["paymentMethod"] = payment_method
        existing["paymentChannel"] = payment_channel
        existing["agentDisplayName"] = user_display_name(agent)
        existing["updatedAt"] = now_iso()
        write_orders(data)
        return existing, False
    order = {
        "id": new_id("order"),
        "status": "pending",
        "action": action,
        "amount": round(float(amount or 0), 2),
        "currency": currency or "CNY",
        "agentId": agent.get("id"),
        "agentUsername": agent.get("username"),
        "agentDisplayName": user_display_name(agent),
        "detail": detail,
        "request": request or {},
        "paymentMethod": payment_method,
        "paymentChannel": payment_channel,
        "createdAt": now_iso(),
    }
    data["orders"].insert(0, order)
    write_orders(data)
    title = "代理订单待处理"
    content = f"代理 {user_display_name(agent)} 提交了订单 {order['id']}：{detail}。金额：{order['amount']} {order['currency']}。"
    add_system_notice(title, content, "warn", "super")
    try:
        send_admin_event_email(title, content)
    except Exception:
        pass
    return order, True


def update_user_account(user_id, body, super_edit=False, actor=None):
    store = read_users()
    user = next((u for u in store["users"] if u.get("id") == user_id), None)
    if not user:
        raise ValueError("用户不存在。")
    old_role = user.get("role")
    username = (body.get("username") or user.get("username") or "").strip()
    email = (body.get("email") or user.get("email") or "").strip().lower()
    if not username:
        raise ValueError("用户名不能为空。")
    for other in store["users"]:
        if other.get("id") == user_id:
            continue
        if other.get("username") == username:
            raise ValueError("用户名已存在。")
        if email and (other.get("email") or "").strip().lower() == email:
            raise ValueError("邮箱已存在。")
    user["username"] = username
    user["email"] = email
    if "displayName" in body:
        user["displayName"] = (body.get("displayName") or username).strip() or username
    if super_edit and "role" in body:
        user["role"] = normalize_role(body.get("role"))
        if user["role"] != "user":
            user["parentAgentId"] = ""
    if super_edit and "active" in body:
        user["active"] = bool(body.get("active"))
    if super_edit and "canViewJson" in body:
        user["canViewJson"] = bool(body.get("canViewJson")) or user.get("role") == "super"
    if super_edit and "balance" in body and user.get("role") == "agent":
        try:
            user["balance"] = float(body.get("balance") or 0)
        except Exception:
            raise ValueError("代理余额必须是合法数字。")
    if body.get("password"):
        user["passwordHash"] = stored_password(body.get("password"))
    if super_edit and body.get("resetApiKey"):
        user["apiKey"] = random_hex(20)
    write_users(store)
    if super_edit and old_role != user.get("role"):
        if user.get("role") == "agent":
            log_agent_action("promote", user, actor, "用户管理修改角色")
        elif old_role == "agent":
            log_agent_action("cancel", user, actor, "用户管理修改角色")
    return user


def get_auth(handler):
    auth = handler.headers.get("Authorization", "")
    token = ""
    if auth.startswith("Bearer "):
        token = auth[7:]
    else:
        token = handler.query.get("token", [""])[0]
    session = SESSIONS.get(token)
    if session:
        user = find_user_by_id(session["userId"])
        if user and user.get("active", True) is not False:
            return {"token": token, "user": user}
    if token == ADMIN_TOKEN:
        user = find_user_by_id("admin")
        if user:
            return {"token": token, "user": user}
    return None


def target_user_id(auth, handler):
    target = handler.headers.get("X-Target-User") or handler.query.get("targetUserId", [""])[0]
    if auth["user"].get("role") == "super" and target:
        user = find_user_by_id(target)
        if not user:
            raise ValueError("目标用户不存在。")
        return user["id"]
    return auth["user"]["id"]


def invite_request_from_body(store, body):
    register_role = normalize_role(body.get("registerRole") or "user")
    if register_role not in ("user", "agent"):
        register_role = "user"
    return {
        "prefix": clean_invite_prefix(body.get("prefix") or body.get("code") or "YQ"),
        "count": max(1, min(200, int(body.get("count") or 1))),
        "maxUses": max(1, int(body.get("maxUses") or 1)),
        "retentionDays": max(0, int(body.get("retentionDays") or (store.get("settings") or {}).get("inviteRetentionDays") or 7)),
        "registerRole": register_role,
        "boundAgentId": str(body.get("boundAgentId") or "").strip(),
    }


def invite_quote_for_actor(store, actor, body):
    settings = read_system_settings()
    agent_settings = settings.get("agent") or {}
    price = float(agent_settings.get("invitePrice") or 0)
    request = normalize_invite_request_for_actor(store, actor, invite_request_from_body(store, body))
    count = request["count"]
    total = count * price
    balance = float(actor.get("balance") or 0)
    allow_negative = bool(agent_settings.get("allowNegativeBalance"))
    currency = agent_settings.get("currency") or "CNY"
    return {
        "request": request,
        "price": round(price, 2),
        "total": round(total, 2),
        "currency": currency,
        "balance": round(balance, 2),
        "balanceEnough": balance >= total,
        "allowNegativeBalance": allow_negative,
        "channels": public_payment_channels(settings),
    }


def normalize_invite_request_for_actor(store, actor, request):
    normalized = dict(request or {})
    normalized["registerRole"] = normalized.get("registerRole") if normalized.get("registerRole") in ("user", "agent") else "user"
    if not is_super(actor):
        if normalized.get("registerRole") == "agent":
            raise ValueError("只有总管理员可以生成注册后为代理的邀请码。")
        requested_bound = str(normalized.get("boundAgentId") or "").strip()
        if requested_bound and requested_bound != actor.get("id"):
            raise ValueError("代理只能生成绑定自己的邀请码。")
        normalized["registerRole"] = "user"
        normalized["boundAgentId"] = actor.get("id") if is_agent(actor) else ""
    bound_agent_id = str(normalized.get("boundAgentId") or "").strip()
    bound_agent = None
    if bound_agent_id:
        bound_agent = next((
            u for u in store.get("users", [])
            if u.get("id") == bound_agent_id and u.get("role") == "agent" and u.get("active", True) is not False
        ), None)
        if not bound_agent:
            raise ValueError("绑定代理不存在或不是有效代理。")
    normalized["boundAgentId"] = bound_agent.get("id") if bound_agent else ""
    normalized["boundAgentName"] = user_display_name(bound_agent) if bound_agent else ""
    normalized["isAgentInvite"] = normalized.get("registerRole") == "agent"
    return normalized


def generate_invites_for_actor(store, actor, body, price=0, charged_amount=0):
    request = normalize_invite_request_for_actor(store, actor, invite_request_from_body(store, body))
    prefix = request["prefix"]
    count = request["count"]
    max_uses = request["maxUses"]
    retention_days = request["retentionDays"]
    register_role = request.get("registerRole") or "user"
    bound_agent_id = request.get("boundAgentId") or ""
    bound_agent_name = request.get("boundAgentName") or ""
    existing = {x.get("code") for x in store["inviteCodes"]}
    created = []
    for _ in range(count):
        code = make_invite_code(prefix, existing)
        existing.add(code)
        invite = {"code": code, "active": True, "maxUses": max_uses,
                  "usedCount": 0, "usedBy": [], "retentionDays": retention_days,
                  "createdAt": now_iso(), "createdBy": actor.get("username"),
                  "createdById": actor.get("id"), "ownerAgentId": actor.get("id") if is_agent(actor) else "",
                  "ownerAgentName": user_display_name(actor) if is_agent(actor) else "",
                  "registerRole": register_role,
                  "boundAgentId": bound_agent_id,
                  "boundAgentName": bound_agent_name,
                  "isAgentInvite": register_role == "agent",
                  "price": price if is_agent(actor) else 0, "chargedAmount": charged_amount if is_agent(actor) else 0}
        created.append(invite)
    store["inviteCodes"][0:0] = created
    return created


def order_detail_for_invites(request):
    role_text = "代理" if request.get("registerRole") == "agent" else "普通用户"
    bound_text = f"，绑定代理 {request.get('boundAgentName')}" if request.get("boundAgentName") else ""
    return f"生成 {request.get('count')} 个邀请码，可用次数 {request.get('maxUses')}，使用后保留 {request.get('retentionDays')} 天，注册后角色 {role_text}{bound_text}"


def create_invites_for_actor(store, actor, body):
    quote = invite_quote_for_actor(store, actor, body)
    request = quote["request"]
    price = float(quote["price"] or 0)
    total = float(quote["total"] or 0)
    currency = quote["currency"]
    if is_agent(actor):
        payment_method = (body.get("paymentMethod") or "").strip()
        payment_channel = (body.get("paymentChannel") or "").strip()
        channels = [x.get("key") for x in quote.get("channels") or []]
        if not payment_method:
            payment_method = "manual"
        if payment_method == "interface" and payment_channel not in channels:
            raise ValueError("支付接口未配置或不可用，请选择提交总管理审核。")
        if payment_method not in ("balance", "manual", "interface"):
            raise ValueError("不支持的付款方式。")
        order, fresh = create_admin_order(
            actor,
            "create_invites",
            total,
            currency,
            order_detail_for_invites(request),
            request=request,
            payment_method=payment_method,
            payment_channel=payment_channel,
        )
        suffix = "已创建订单并通知总管理" if fresh else "已有待处理订单，已更新并发送到总管理后台"
        return {"order": public_order(order), "created": False, "message": f"{suffix}，管理通过后才会生成邀请码。订单号：{order.get('id')}。"}
    created = generate_invites_for_actor(store, actor, request, price, total)
    return {"invites": created, "created": True, "balance": actor.get("balance", 0)}


def fulfill_invite_order(order, approver):
    if order.get("action") != "create_invites" or order.get("fulfilledAt"):
        return []
    store = read_users()
    agent = next((u for u in store.get("users", []) if u.get("id") == order.get("agentId")), None)
    if not agent:
        raise ValueError("订单对应的代理不存在。")
    request = order.get("request") or {}
    if not request:
        raise ValueError("订单缺少邀请码生成参数。")
    settings = read_system_settings()
    agent_settings = settings.get("agent") or {}
    price = float(agent_settings.get("invitePrice") or 0)
    amount = float(order.get("amount") or 0)
    payment_method = order.get("paymentMethod") or "manual"
    if payment_method == "balance":
        balance = float(agent.get("balance") or 0)
        allow_negative = bool(agent_settings.get("allowNegativeBalance"))
        if balance < amount and not allow_negative:
            raise ValueError(f"代理余额不足，不能通过余额支付订单。当前余额 {balance:.2f}，订单金额 {amount:.2f}。")
        agent["balance"] = balance - amount
    created = generate_invites_for_actor(store, agent, request, price, amount)
    write_users(store)
    order["fulfilledAt"] = now_iso()
    order["fulfilledBy"] = approver.get("username")
    order["fulfilledByName"] = user_display_name(approver)
    order["agentDisplayName"] = user_display_name(agent)
    order["fulfilledInviteCodes"] = [x.get("code") for x in created]
    content = f"总管理员 {user_display_name(approver)} 已通过代理 {user_display_name(agent)} 的订单 {order.get('id')}，生成 {len(created)} 个邀请码，金额：{amount:.2f} {order.get('currency', 'CNY')}。"
    add_system_notice("代理邀请码订单已通过", content, "info", "super")
    try:
        send_admin_event_email("代理邀请码订单已通过", content)
    except Exception:
        pass
    return created

def get_target(button):
    action = button.get("action", "link")
    if action == "download":
        return button.get("download_url") or button.get("url") or button.get("target") or ""
    if action == "cmd":
        return button.get("command") or button.get("target") or ""
    if action == "script":
        return normalize_script_target(button.get("script_id") or button.get("target") or "")
    if action == "winget":
        return button.get("package_id") or button.get("target") or ""
    return button.get("url") or button.get("target") or ""


def new_button(body):
    action = body.get("action", "link")
    target = body.get("target") or body.get("url") or ""
    if action == "script":
        target = normalize_script_target(target)
    item = {"name": body.get("name", "未命名"), "icon": body.get("icon", ""), "action": action}
    item["id"] = body.get("id") or new_id("btn")
    item["enabled"] = body.get("enabled", True) is not False
    try:
        item["sort"] = int(body.get("sort") if body.get("sort") not in (None, "") else 0)
    except Exception:
        item["sort"] = 0
    if body.get("description") or body.get("intro") or body.get("remark"):
        item["description"] = body.get("description") or body.get("intro") or body.get("remark")
    if action == "download":
        item["download_url"] = target
    elif action == "cmd":
        item["command"] = target
    elif action == "script":
        item["script_id"] = target
        if target not in SCRIPT_LABELS:
            item["custom_script"] = target
    elif action == "winget":
        item["package_id"] = target
    else:
        item["url"] = target
    return item


def button_sort_value(button):
    try:
        return int((button or {}).get("sort") or 0)
    except Exception:
        return 0


def button_rows(config):
    rows = []
    changed = False
    for page_id, page in (config.get("pages") or {}).items():
        for si, section in enumerate(page.get("sections") or []):
            buttons = section.get("buttons") or []
            kept = [button for button in buttons if not is_empty_button(button)]
            if len(kept) != len(buttons):
                section["buttons"] = kept
                changed = True
            for bi, button in enumerate(section.get("buttons") or []):
                if not button.get("id"):
                    button["id"] = new_id("btn")
                    changed = True
                rows.append({"scope": "page", "pageId": page_id, "tabIndex": None, "sectionIndex": si, "buttonIndex": bi,
                             "id": button.get("id"),
                             "area": page.get("title") or page.get("name") or page_id, "section": section.get("title", ""),
                             "name": button.get("name", ""), "icon": button.get("icon", ""), "action": button.get("action", "link"),
                             "enabled": button.get("enabled", True) is not False,
                             "sort": button_sort_value(button), "target": get_target(button), "raw": button})
    for ti, tab in enumerate(config.get("toolbox_tabs") or []):
        for si, section in enumerate(tab.get("sections") or []):
            buttons = section.get("buttons") or []
            kept = [button for button in buttons if not is_empty_button(button)]
            if len(kept) != len(buttons):
                section["buttons"] = kept
                changed = True
            for bi, button in enumerate(section.get("buttons") or []):
                if not button.get("id"):
                    button["id"] = new_id("btn")
                    changed = True
                rows.append({"scope": "toolbox", "pageId": None, "tabIndex": ti, "sectionIndex": si, "buttonIndex": bi,
                             "id": button.get("id"),
                             "area": tab.get("name", ""), "section": section.get("title", ""),
                             "name": button.get("name", ""), "icon": button.get("icon", ""), "action": button.get("action", "link"),
                             "enabled": button.get("enabled", True) is not False,
                             "sort": button_sort_value(button), "target": get_target(button), "raw": button})
    rows.sort(key=lambda row: (row.get("area") or "", row.get("section") or "", int(row.get("sort") or 0), int(row.get("buttonIndex") or 0)))
    return rows, changed


def is_empty_button(button):
    if not isinstance(button, dict):
        return True
    name = str(button.get("name") or "").strip()
    if name and name != "未命名":
        return False
    if str(button.get("icon") or "").strip():
        return False
    if str(button.get("description") or button.get("intro") or button.get("remark") or "").strip():
        return False
    return not get_target(button).strip()


def get_container(config, body):
    if body.get("scope") == "toolbox":
        return config["toolbox_tabs"][int(body.get("tabIndex", 0))]
    return config["pages"][body.get("pageId")]


def find_button_slot(config, body):
    button_id = body.get("id")
    if button_id:
        for page_id, page in (config.get("pages") or {}).items():
            for si, section in enumerate(page.get("sections") or []):
                for bi, button in enumerate(section.get("buttons") or []):
                    if button.get("id") == button_id:
                        return section, bi
        for ti, tab in enumerate(config.get("toolbox_tabs") or []):
            for si, section in enumerate(tab.get("sections") or []):
                for bi, button in enumerate(section.get("buttons") or []):
                    if button.get("id") == button_id:
                        return section, bi
    container = get_container(config, body)
    section = container["sections"][int(body["sectionIndex"])]
    return section, int(body["buttonIndex"])


def clean_invite_prefix(value):
    text = "".join(ch for ch in str(value or "YQ").upper() if ch.isalnum() or ch in "-_").strip("-_")
    return (text or "YQ")[:18]


def make_invite_code(prefix, existing):
    for _ in range(1000):
        code = f"{prefix}-{random_hex(4).upper()}"
        if code not in existing:
            return code
    raise ValueError("邀请码生成失败，请重试。")


def csharp_literal(value):
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t") + '"'


def assembly_version(value):
    text = str(value or "1.0.0.0").strip().lstrip("vV")
    parts = []
    for raw in text.replace("_", ".").replace("-", ".").split("."):
        if raw.isdigit():
            parts.append(str(max(0, min(65535, int(raw)))))
        if len(parts) == 4:
            break
    while len(parts) < 4:
        parts.append("0")
    return ".".join(parts)


def make_ico_from_png(png_bytes):
    size = len(png_bytes)
    header = b"\x00\x00\x01\x00\x01\x00"
    entry = bytes([0, 0, 0, 0]) + (1).to_bytes(2, "little") + (32).to_bytes(2, "little") + size.to_bytes(4, "little") + (22).to_bytes(4, "little")
    return header + entry + png_bytes


def custom_client_icon(app, target_dir):
    url = (app.get("exe_icon") or app.get("exe_icon_url") or "").strip()
    if not url:
        return CLIENT_ICON
    if url.lower().startswith(("http://", "https://")):
        cache_key = hashlib.sha256(url.encode("utf-8")).hexdigest()
        cached_icon = ICON_CACHE / f"{cache_key}.ico"
        if cached_icon.exists():
            return cached_icon
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "ToolboxAdminApi"})
        with urllib.request.urlopen(request, timeout=3) as response:
            data = response.read(2 * 1024 * 1024)
            content_type = response.headers.get("Content-Type", "").lower()
        icon_path = Path(target_dir) / "client-icon.ico"
        lower = url.lower().split("?", 1)[0]
        if lower.endswith(".ico") or "image/x-icon" in content_type or "image/vnd.microsoft.icon" in content_type:
            icon_path.write_bytes(data)
            if url.lower().startswith(("http://", "https://")):
                ICON_CACHE.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(icon_path, ICON_CACHE / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.ico")
            return icon_path
        if lower.endswith(".png") or "image/png" in content_type or data.startswith(b"\x89PNG\r\n\x1a\n"):
            icon_path.write_bytes(make_ico_from_png(data))
            if url.lower().startswith(("http://", "https://")):
                ICON_CACHE.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(icon_path, ICON_CACHE / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.ico")
            return icon_path
    except Exception:
        if url.lower().startswith(("http://", "https://")):
            cached_icon = ICON_CACHE / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.ico"
            if cached_icon.exists():
                return cached_icon
        return CLIENT_ICON
    return CLIENT_ICON


def client_cache_key(user, base_url, app_config, source, build_id, build_stamp, integrity_seed, variant=DEFAULT_CLIENT_VARIANT):
    icon_ref = (app_config.get("exe_icon") or app_config.get("exe_icon_url") or "").strip()
    payload = {
        "variant": normalize_client_variant(variant),
        "userId": user.get("id"),
        "username": user.get("username"),
        "displayName": user_display_name(user),
        "apiKey": user.get("apiKey"),
        "baseUrl": base_url.rstrip("/"),
        "app": app_config,
        "templateSha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "buildId": build_id,
        "buildStamp": build_stamp,
        "integritySeed": integrity_seed,
        "defaultIconMtime": int(CLIENT_ICON.stat().st_mtime) if CLIENT_ICON.exists() else 0,
        "iconRef": icon_ref,
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def read_client_cache(cache_key):
    exe_path = CLIENT_CACHE / f"{cache_key}.exe"
    meta_path = CLIENT_CACHE / f"{cache_key}.json"
    if not exe_path.exists() or not meta_path.exists():
        return None
    try:
        meta = read_json(meta_path, {})
        data = exe_path.read_bytes()
        if not is_windows_exe(data):
            exe_path.unlink(missing_ok=True)
            meta_path.unlink(missing_ok=True)
            return None
        return meta.get("name") or "toolbox.exe", data
    except Exception:
        return None


def write_client_cache(cache_key, name, data):
    if not is_windows_exe(data):
        raise RuntimeError("EXE 生成结果无效，已拒绝写入缓存。")
    CLIENT_CACHE.mkdir(parents=True, exist_ok=True)
    exe_path = CLIENT_CACHE / f"{cache_key}.exe"
    meta_path = CLIENT_CACHE / f"{cache_key}.json"
    exe_path.write_bytes(data)
    write_json(meta_path, {"name": name, "createdAt": now_iso(), "bytes": len(data)})
    cleanup_client_build_artifacts()


def cleanup_client_build_artifacts():
    settings = client_build_cleanup_settings()
    now_ts = time.time()
    cache_cutoff = now_ts - settings["cacheSeconds"]
    job_cutoff = now_ts - settings["jobSeconds"]
    try:
        CLIENT_CACHE.mkdir(parents=True, exist_ok=True)
        entries = sorted(CLIENT_CACHE.glob("*.exe"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in entries[settings["maxEntries"]:]:
            old.unlink(missing_ok=True)
            old.with_suffix(".json").unlink(missing_ok=True)
        for exe_path in CLIENT_CACHE.glob("*.exe"):
            try:
                if exe_path.stat().st_mtime < cache_cutoff:
                    exe_path.unlink(missing_ok=True)
                    exe_path.with_suffix(".json").unlink(missing_ok=True)
            except Exception:
                pass
        for meta_path in CLIENT_CACHE.glob("*.json"):
            try:
                if not meta_path.with_suffix(".exe").exists():
                    meta_path.unlink(missing_ok=True)
            except Exception:
                pass
    except Exception:
        pass
    try:
        CLIENT_JOBS.mkdir(parents=True, exist_ok=True)
        for exe_path in CLIENT_JOBS.glob("*.exe"):
            try:
                if exe_path.stat().st_mtime < job_cutoff:
                    exe_path.unlink(missing_ok=True)
            except Exception:
                pass
        with CLIENT_BUILD_LOCK:
            stale_job_ids = []
            for job_id, job in CLIENT_BUILD_JOBS.items():
                status = job.get("status")
                updated_at = float(job.get("updatedAt") or job.get("createdAt") or 0)
                if status in ("done", "error", "missing") and updated_at < job_cutoff:
                    stale_job_ids.append(job_id)
            for job_id in stale_job_ids:
                CLIENT_BUILD_JOBS.pop(job_id, None)
    except Exception:
        pass


def run_client_build_cleanup_loop():
    while True:
        try:
            cleanup_client_build_artifacts()
        except Exception:
            pass
        time.sleep(client_build_cleanup_settings()["intervalSeconds"])


def public_client_build_job(job_id):
    cleanup_client_build_artifacts()
    with CLIENT_BUILD_LOCK:
        job = dict(CLIENT_BUILD_JOBS.get(job_id) or {})
    if not job:
        return None
    return {
        "id": job_id,
        "status": job.get("status", "missing"),
        "message": job.get("message", ""),
        "fileName": job.get("fileName", ""),
        "variant": job.get("variant", DEFAULT_CLIENT_VARIANT),
        "variantLabel": job.get("variantLabel", client_variant_info(job.get("variant", DEFAULT_CLIENT_VARIANT)).get("label")),
        "createdAt": job.get("createdAt", 0),
        "updatedAt": job.get("updatedAt", 0),
    }


def integrity_settings():
    settings = read_system_settings().get("integrity") or {}
    secret = str(settings.get("secret") or "").strip()
    if len(secret) < 32:
        secret = random_hex(24)
        settings["secret"] = secret
        system = read_system_settings()
        system["integrity"] = settings
        write_json(SYSTEM_PATH, system)
    try:
        ttl_minutes = max(5, min(43200, int(settings.get("tokenTtlMinutes") or 10080)))
    except Exception:
        ttl_minutes = 10080
    return {
        "enabled": settings.get("enabled", True) is not False,
        "secret": secret,
        "tokenTtlSeconds": ttl_minutes * 60,
        "lockBuildAfterFirstIssue": settings.get("lockBuildAfterFirstIssue", False) is not False,
    }


def client_signature_payload(user_id, api_key, build_id, build_stamp, integrity_seed, base_url, exe_sha256=""):
    return "|".join([
        str(user_id or ""),
        str(api_key or ""),
        str(build_id or ""),
        str(build_stamp or ""),
        str(integrity_seed or ""),
        str(base_url or "").rstrip("/"),
        str(exe_sha256 or ""),
    ])


def sign_client_build(user_id, api_key, build_id, build_stamp, integrity_seed, base_url, exe_sha256=""):
    settings = integrity_settings()
    payload = client_signature_payload(user_id, api_key, build_id, build_stamp, integrity_seed, base_url, exe_sha256)
    return hmac_sha256_hex(settings["secret"], payload)


def register_client_build(user, api_key, base_url, build_id, build_stamp, integrity_seed, exe_sha256, source_sha256):
    data = read_client_integrity()
    builds = data.setdefault("builds", {})
    build_signature = sign_client_build(user.get("id"), api_key, build_id, build_stamp, integrity_seed, base_url, exe_sha256)
    builds[build_id] = {
        "id": build_id,
        "userId": user.get("id"),
        "username": user.get("username"),
        "apiKeyHash": sha256_hex(api_key),
        "baseUrl": base_url.rstrip("/"),
        "buildStamp": str(build_stamp),
        "integritySeedHash": sha256_hex(integrity_seed),
        "exeSha256": exe_sha256,
        "sourceSha256": source_sha256,
        "signature": build_signature,
        "createdAt": now_iso(),
        "firstVerifiedAt": "",
        "lastVerifiedAt": "",
        "verifyCount": 0,
        "revoked": False,
    }
    try:
        entries = sorted(builds.values(), key=lambda row: row.get("createdAt", ""), reverse=True)
        keep_ids = {row.get("id") for row in entries[:1000]}
        data["builds"] = {key: value for key, value in builds.items() if key in keep_ids}
    except Exception:
        pass
    write_client_integrity(data)
    return build_signature


def issue_build_runtime_token(build_id, user_id, api_key, expires_in, data=None):
    token = random_hex(32)
    own_data = data is None
    data = data or read_client_integrity()
    cleanup_runtime_tokens(data)
    data.setdefault("tokens", {})[token] = {
        "userId": user_id,
        "apiKeyHash": sha256_hex(api_key),
        "buildId": build_id,
        "issuedAt": time.time(),
        "expiresAt": time.time() + max(60, int(expires_in or 0)),
    }
    if own_data:
        write_client_integrity(data)
    return token


def cleanup_runtime_tokens(data):
    now_ts = time.time()
    tokens = data.setdefault("tokens", {})
    expired = []
    for token, row in tokens.items():
        try:
            if float(row.get("expiresAt", 0)) <= now_ts:
                expired.append(token)
        except Exception:
            expired.append(token)
    for token in expired:
        tokens.pop(token, None)


def verify_runtime_token(handler, user):
    settings = integrity_settings()
    if not settings["enabled"]:
        return True
    token = (handler.headers.get("X-Client-Integrity") or handler.query.get("runtimeToken", [""])[0] or "").strip()
    if not token:
        return verify_build_headers(handler, user)
    data = read_client_integrity()
    cleanup_runtime_tokens(data)
    row = data.get("tokens", {}).get(token)
    if not row:
        write_client_integrity(data)
        return verify_build_headers(handler, user)
    if row.get("userId") != user.get("id"):
        return False
    if row.get("apiKeyHash") != sha256_hex(user.get("apiKey") or ""):
        return False
    if float(row.get("expiresAt", 0) or 0) <= time.time():
        data.get("tokens", {}).pop(token, None)
        write_client_integrity(data)
        return verify_build_headers(handler, user)
    return True

def verify_any_runtime_token(handler):
    settings = integrity_settings()
    if not settings["enabled"]:
        return True
    token = (handler.headers.get("X-Client-Integrity") or handler.query.get("runtimeToken", [""])[0] or "").strip()
    if not token:
        return verify_build_headers(handler)
    data = read_client_integrity()
    cleanup_runtime_tokens(data)
    row = data.get("tokens", {}).get(token)
    if not row:
        write_client_integrity(data)
        return verify_build_headers(handler)
    if float(row.get("expiresAt", 0) or 0) <= time.time():
        data.get("tokens", {}).pop(token, None)
        write_client_integrity(data)
        return verify_build_headers(handler)
    return True

def verify_build_headers(handler, user=None):
    settings = integrity_settings()
    if not settings["enabled"]:
        return True
    api_key = (handler.query.get("key", [""])[0] or handler.headers.get("X-Client-Api-Key") or "").strip()
    if user is None and api_key:
        user = find_user_by_api_key(api_key)
    if not user:
        return False
    if not api_key:
        api_key = user.get("apiKey") or ""
    build_id = (handler.headers.get("X-Client-Build-Id") or "").strip()
    build_stamp = (handler.headers.get("X-Client-Build-Stamp") or "").strip()
    integrity_seed = (handler.headers.get("X-Client-Integrity-Seed") or "").strip()
    build_signature = (handler.headers.get("X-Client-Build-Signature") or "").strip()
    exe_sha256 = (handler.headers.get("X-Client-Exe-Sha256") or "").strip().lower()
    if not build_id or not build_stamp or not integrity_seed or not build_signature or not exe_sha256:
        return False
    data = read_client_integrity()
    cleanup_runtime_tokens(data)
    build = data.get("builds", {}).get(build_id)
    if build:
        if build.get("revoked"):
            return False
        if build.get("userId") != user.get("id") or build.get("apiKeyHash") != sha256_hex(api_key):
            return False
        if build.get("buildStamp") != build_stamp or build.get("integritySeedHash") != sha256_hex(integrity_seed):
            return False
        if build.get("exeSha256") and build.get("exeSha256") != exe_sha256:
            return False
        return True
    expected_signature = sign_client_build(user.get("id"), api_key, build_id, build_stamp, integrity_seed, normalize_public_base_url(handler.base_url()), "")
    if not constant_time_equals(build_signature, expected_signature):
        return False
    data.setdefault("builds", {})[build_id] = {
        "id": build_id,
        "userId": user.get("id"),
        "username": user.get("username"),
        "apiKeyHash": sha256_hex(api_key),
        "baseUrl": normalize_public_base_url(handler.base_url()).rstrip("/"),
        "buildStamp": build_stamp,
        "integritySeedHash": sha256_hex(integrity_seed),
        "exeSha256": exe_sha256,
        "sourceSha256": "",
        "signature": build_signature,
        "createdAt": now_iso(),
        "firstVerifiedAt": "",
        "lastVerifiedAt": "",
        "verifyCount": 0,
        "revoked": False,
    }
    write_client_integrity(data)
    return True


def verify_client_build_request(handler):
    body = handler.read_body()
    api_key = (body.get("apiKey") or handler.query.get("key", [""])[0] or "").strip()
    user = find_user_by_api_key(api_key)
    if not user:
        return False, {"error": "工具箱对接密钥无效或账号已停用。"}, 403
    settings = integrity_settings()
    if not settings["enabled"]:
        token = issue_build_runtime_token("integrity-disabled", user.get("id"), api_key, settings["tokenTtlSeconds"])
        return True, {"ok": True, "runtimeToken": token, "expiresIn": settings["tokenTtlSeconds"]}, 200
    build_id = str(body.get("buildId") or "").strip()
    build_stamp = str(body.get("buildStamp") or "").strip()
    integrity_seed = str(body.get("integritySeed") or "").strip()
    build_signature = str(body.get("buildSignature") or "").strip()
    exe_sha256 = str(body.get("exeSha256") or "").strip().lower()
    if not build_id or not build_stamp or not integrity_seed or not exe_sha256:
        return False, {"error": "工具箱编译校验参数不完整，请从后台重新下载。"}, 400
    data = read_client_integrity()
    cleanup_runtime_tokens(data)
    build = data.get("builds", {}).get(build_id)
    if not build:
        expected_signature = sign_client_build(user.get("id"), api_key, build_id, build_stamp, integrity_seed, normalize_public_base_url(handler.base_url()), "")
        if not build_signature or not constant_time_equals(build_signature, expected_signature):
            write_client_integrity(data)
            return False, {"error": "工具箱编译记录不存在，请从后台重新下载。"}, 403
        build = {
            "id": build_id,
            "userId": user.get("id"),
            "username": user.get("username"),
            "apiKeyHash": sha256_hex(api_key),
            "baseUrl": normalize_public_base_url(handler.base_url()).rstrip("/"),
            "buildStamp": build_stamp,
            "integritySeedHash": sha256_hex(integrity_seed),
            "exeSha256": exe_sha256,
            "sourceSha256": "",
            "signature": build_signature,
            "createdAt": now_iso(),
            "firstVerifiedAt": "",
            "lastVerifiedAt": "",
            "verifyCount": 0,
            "revoked": False,
        }
        data.setdefault("builds", {})[build_id] = build
    if build.get("revoked"):
        return False, {"error": "该工具箱版本已被管理员停用，请重新下载最新版。"}, 403
    if build.get("userId") != user.get("id") or build.get("apiKeyHash") != sha256_hex(api_key):
        return False, {"error": "工具箱用户校验失败，请使用当前账号重新下载。"}, 403
    if build.get("buildStamp") != build_stamp or build.get("integritySeedHash") != sha256_hex(integrity_seed):
        return False, {"error": "工具箱编译信息校验失败，请重新下载。"}, 403
    if build.get("exeSha256") and build.get("exeSha256") != exe_sha256:
        return False, {"error": "工具箱文件已被修改，请从后台重新下载最新版。"}, 403
    token = issue_build_runtime_token(build_id, user.get("id"), api_key, settings["tokenTtlSeconds"], data)
    build["lastVerifiedAt"] = now_iso()
    build["verifyCount"] = int(build.get("verifyCount") or 0) + 1
    if not build.get("firstVerifiedAt"):
        build["firstVerifiedAt"] = build["lastVerifiedAt"]
    write_client_integrity(data)
    return True, {"ok": True, "runtimeToken": token, "expiresIn": settings["tokenTtlSeconds"]}, 200

def start_client_build_job(user, base_url, variant=DEFAULT_CLIENT_VARIANT):
    cleanup_client_build_artifacts()
    CLIENT_JOBS.mkdir(parents=True, exist_ok=True)
    job_id = random_hex(12)
    now = time.time()
    variant = normalize_client_variant(variant)
    variant_label = client_variant_info(variant).get("label") or "工具箱"
    with CLIENT_BUILD_LOCK:
        CLIENT_BUILD_JOBS[job_id] = {
            "status": "queued",
            "message": "已加入生成队列",
            "userId": user.get("id"),
            "variant": variant,
            "variantLabel": variant_label,
            "createdAt": now,
            "updatedAt": now,
        }

    def run():
        try:
            with CLIENT_BUILD_LOCK:
                CLIENT_BUILD_JOBS[job_id]["status"] = "building"
                CLIENT_BUILD_JOBS[job_id]["message"] = f"服务器正在编译 {variant_label}"
                CLIENT_BUILD_JOBS[job_id]["updatedAt"] = time.time()
            name, data = make_client_exe(user, base_url, variant)
            if not is_windows_exe(data):
                raise RuntimeError("EXE 生成结果无效，请检查服务器编译器和缓存目录。")
            exe_path = CLIENT_JOBS / f"{job_id}.exe"
            exe_path.write_bytes(data)
            with CLIENT_BUILD_LOCK:
                CLIENT_BUILD_JOBS[job_id].update({
                    "status": "done",
                    "message": "工具箱 EXE 已生成",
                    "fileName": name,
                    "variant": variant,
                    "variantLabel": variant_label,
                    "path": str(exe_path),
                    "bytes": len(data),
                    "updatedAt": time.time(),
                })
        except Exception as exc:
            with CLIENT_BUILD_LOCK:
                CLIENT_BUILD_JOBS[job_id].update({
                    "status": "error",
                    "message": str(exc),
                    "updatedAt": time.time(),
                })

    threading.Thread(target=run, daemon=True).start()
    return public_client_build_job(job_id)


def make_client_exe(user, base_url, variant=DEFAULT_CLIENT_VARIANT):
    variant = normalize_client_variant(variant)
    if not CLIENT_TEMPLATE.exists():
        raise RuntimeError("客户端模板缺失，无法生成 EXE。")
    compiler = find_csharp_compiler()
    if not compiler:
        raise RuntimeError("服务器未安装 Mono/C# 编译器，无法在线生成 EXE。后台可正常使用；如需下载 EXE，请安装 mono-devel 后重启 toolbox-admin。")
    if not CLIENT_ICON.exists():
        raise RuntimeError("工具箱默认图标缺失，请上传 assets/toolbox-default.ico 后再生成 EXE。")
    base_url = normalize_public_base_url(base_url)
    api_key = user.get("apiKey") or random_hex(20)
    user["apiKey"] = api_key
    config_url = f"{base_url.rstrip('/')}/api/toolbox/config?key={quote(api_key)}"
    source = CLIENT_TEMPLATE.read_text(encoding="utf-8")
    app_config = read_config(user.get("id")).get("app", {})
    build_id = random_hex(12)
    build_stamp = str(int(time.time()))
    integrity_seed = random_hex(16)
    exe_title = app_config.get("exe_title") or app_config.get("title") or "Toolbox"
    exe_description = app_config.get("exe_description") or app_config.get("subtitle") or exe_title
    exe_product = app_config.get("exe_product") or app_config.get("title") or exe_title
    exe_company = app_config.get("exe_company") or ""
    exe_copyright = app_config.get("exe_copyright") or ""
    exe_version = assembly_version(app_config.get("exe_version") or app_config.get("version") or "1.0.0.0")
    variant_label = client_variant_info(variant).get("label") or "工具箱"
    file_name = client_exe_filename(user, variant=variant)
    cache_key = client_cache_key(user, base_url, app_config, source, build_id, build_stamp, integrity_seed, variant)
    cached = read_client_cache(cache_key)
    if cached:
        return cached
    source = source.replace('"__CONFIG_URL__"', csharp_literal(config_url))
    source = source.replace('"__CLIENT_VARIANT__"', csharp_literal(variant))
    source = source.replace('"__CLIENT_VARIANT_LABEL__"', csharp_literal(variant_label))
    source = source.replace('"__BUILD_ID__"', csharp_literal(build_id))
    source = source.replace('"__BUILD_STAMP__"', csharp_literal(build_stamp))
    build_signature = sign_client_build(user.get("id"), api_key, build_id, build_stamp, integrity_seed, base_url, "")
    source = source.replace('"__INTEGRITY_SEED__"', csharp_literal(integrity_seed))
    source = source.replace('"__BUILD_SIGNATURE__"', csharp_literal(build_signature))
    source = source.replace('"__EXE_TITLE__"', csharp_literal(exe_title))
    source = source.replace('"__EXE_DESCRIPTION__"', csharp_literal(exe_description))
    source = source.replace('"__EXE_COMPANY__"', csharp_literal(exe_company))
    source = source.replace('"__EXE_PRODUCT__"', csharp_literal(exe_product))
    source = source.replace('"__EXE_COPYRIGHT__"', csharp_literal(exe_copyright))
    source = source.replace('"__EXE_VERSION__"', csharp_literal(exe_version))
    source = source.replace('"__EXE_FILE_VERSION__"', csharp_literal(exe_version))
    with tempfile.TemporaryDirectory() as td:
        icon_file = custom_client_icon(app_config, td)
        src = Path(td) / "ToolboxClient.cs"
        exe = Path(td) / file_name
        src.write_text(source, encoding="utf-8")
        compile_args = ["-target:winexe", "-optimize+", f"-out:{exe}", f"-win32icon:{icon_file}",
                        "-r:System.dll", "-r:System.Core.dll", "-r:System.Windows.Forms.dll",
                        "-r:System.Drawing.dll", "-r:System.Web.Extensions.dll", str(src)]
        args = csharp_compile_command(compiler, compile_args)
        result = subprocess.run(args, universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        if result.returncode != 0 or not exe.exists():
            raise RuntimeError("EXE 编译失败：" + (result.stderr or result.stdout))
        data = exe.read_bytes()
        if not is_windows_exe(data):
            raise RuntimeError(
                "EXE 编译完成但输出不是 Windows EXE。"
                f"检测到的编译器：{compiler}；文件头：{binary_header_preview(data)}。"
                "请安装 mono-devel 后重启 toolbox-admin，再清理旧编译缓存重试。"
            )
        exe_sha256 = hashlib.sha256(data).hexdigest()
        source_sha256 = hashlib.sha256(source.encode("utf-8")).hexdigest()
        register_client_build(user, api_key, base_url, build_id, build_stamp, integrity_seed, exe_sha256, source_sha256)
        write_client_cache(cache_key, file_name, data)
        return file_name, data


def admin_desktop_exe_filename(timestamp=None):
    return f"toolbox-admin-desktop-{int(timestamp or time.time())}.exe"


def make_admin_desktop_exe(base_url):
    if not ADMIN_DESKTOP_TEMPLATE.exists():
        raise RuntimeError("后台 EXE 模板缺失，无法生成。")
    compiler = find_csharp_compiler()
    if not compiler:
        raise RuntimeError("服务器未安装 Mono/C# 编译器，无法在线生成后台 EXE。请安装 mono-devel 后重启 toolbox-admin。")
    if not CLIENT_ICON.exists():
        raise RuntimeError("后台默认图标缺失，请上传 assets/toolbox-default.ico 后再生成 EXE。")
    base_url = normalize_public_base_url(base_url)
    source = ADMIN_DESKTOP_TEMPLATE.read_text(encoding="utf-8")
    if any(marker not in source for marker in ("Register(", "SendResetCode(", "ResetPassword(")):
        raise RuntimeError("后台 EXE 模板不完整/已过期：缺少 Register/SendResetCode/ResetPassword。")
    app_config = read_config("").get("app", {})
    exe_title = app_config.get("admin_desktop_title") or app_config.get("admin_title") or DEFAULT_ADMIN_TITLE
    exe_description = app_config.get("admin_desktop_description") or "工具箱后台桌面登录器"
    exe_product = app_config.get("admin_desktop_product") or exe_title
    exe_company = app_config.get("exe_company") or ""
    exe_copyright = app_config.get("exe_copyright") or ""
    exe_version = assembly_version(app_config.get("admin_desktop_version") or app_config.get("exe_version") or app_config.get("version") or "1.0.0.0")
    file_name = admin_desktop_exe_filename()
    source = source.replace('"__ADMIN_URL__"', csharp_literal(base_url))
    source = source.replace('"__ADMIN_TOKEN__"', csharp_literal(ADMIN_TOKEN))
    source = source.replace('"__APP_TITLE__"', csharp_literal(exe_title))
    source = source.replace('"__LOGIN_HINT__"', csharp_literal(app_config.get("login_hint") or DEFAULT_LOGIN_HINT))
    source = source.replace('"__EXE_TITLE__"', csharp_literal(exe_title))
    source = source.replace('"__EXE_DESCRIPTION__"', csharp_literal(exe_description))
    source = source.replace('"__EXE_COMPANY__"', csharp_literal(exe_company))
    source = source.replace('"__EXE_PRODUCT__"', csharp_literal(exe_product))
    source = source.replace('"__EXE_COPYRIGHT__"', csharp_literal(exe_copyright))
    source = source.replace('"__EXE_VERSION__"', csharp_literal(exe_version))
    source = source.replace('"__EXE_FILE_VERSION__"', csharp_literal(exe_version))
    with tempfile.TemporaryDirectory() as td:
        icon_file = custom_client_icon(app_config, td)
        src = Path(td) / "ToolboxAdminDesktop.cs"
        exe = Path(td) / file_name
        src.write_text(source, encoding="utf-8")
        compile_args = [
            "-target:winexe",
            "-optimize+",
            f"-out:{exe}",
            f"-win32icon:{icon_file}",
            "-r:System.dll",
            "-r:System.Core.dll",
            "-r:System.Windows.Forms.dll",
            "-r:System.Drawing.dll",
            "-r:System.Web.Extensions.dll",
            "-r:System.Security.dll",
            str(src),
        ]
        args = csharp_compile_command(compiler, compile_args)
        result = subprocess.run(args, universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        if result.returncode != 0 or not exe.exists():
            raise RuntimeError("后台 EXE 编译失败：" + (result.stderr or result.stdout))
        data = exe.read_bytes()
        if not is_windows_exe(data):
            raise RuntimeError(
                "后台 EXE 编译完成但输出不是 Windows EXE。"
                f"检测到的编译器：{compiler}；文件头：{binary_header_preview(data)}。"
                "请安装 mono-devel 后重启 toolbox-admin，再重试。"
            )
        return file_name, data


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = "ToolboxAdminApiPython/1.0"

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8") or "{}")

    def send_json(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_bytes(self, data, content_type, status=200, filename=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        if filename:
            fallback = ascii_download_fallback(filename)
            encoded = quote(str(filename), safe="")
            self.send_header("Content-Disposition", f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{encoded}')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PUT(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def do_DELETE(self):
        self.dispatch()

    def dispatch(self):
        try:
            parsed = urlparse(self.path)
            self.route = unquote(parsed.path)
            self.query = parse_qs(parsed.query)
            method = self.command.upper()
            path = self.route
            if path == "/api/health":
                return self.send_json({"ok": True, "app": "ToolboxAdminApi", "time": now_iso()})
            if path == "/api/public/brand" and method == "GET":
                return self.send_json(public_brand_config())
            if path == "/api/public/config-share" and method == "GET":
                token = self.query.get("token", [""])[0]
                return self.send_json(public_config_share(read_config_share(token), self.base_url(), include_config=True))
            if path == "/api/toolbox/verify-build" and method == "POST":
                ok, payload, status = verify_client_build_request(self)
                return self.send_json(payload, status)
            if path == "/api/toolbox/popup-config" and method == "GET":
                user = find_user_by_api_key(self.query.get("key", [""])[0] or self.headers.get("X-Client-Api-Key", ""))
                if not user:
                    return self.send_json({"error": "工具箱对接密钥无效或账号已停用。"}, 403)
                return self.send_json(public_popup_config(user["id"], self.base_url()))
            if is_login_api_path(path) and method == "POST":
                return handle_desktop_login(self)
            if path in ("/api/toolbox/config", "/api/config"):
                user = find_user_by_api_key(self.query.get("key", [""])[0])
                if not user:
                    return self.send_json({"error": "工具箱对接密钥无效或账号已停用。"}, 403)
                return self.send_json(public_toolbox_config(user["id"]))

            if path.startswith("/api/"):
                auth = get_auth(self)
                if not auth:
                    return self.send_json({"error": "请先登录。"}, 401)
                if path.startswith("/api/super"):
                    return self.handle_super(path, method, auth)
                if path.startswith("/api/admin"):
                    return self.handle_admin(path, method, auth)
                return self.send_json({"error": "接口不存在。"}, 404)
            return self.serve_static(path)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def handle_super(self, path, method, auth):
        if not can_manage_users(auth["user"]):
            return self.send_json({"error": "无权限访问用户管理。"}, 403)
        store = read_users()
        if path.startswith("/api/super/template"):
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以操作新用户模板。"}, 403)
            if path == "/api/super/template":
                if method == "GET":
                    return self.send_json(read_user_template_config())
                if method == "PUT":
                    write_user_template_config(self.read_body())
                    return self.send_json(read_user_template_config())
                if method == "POST":
                    body = self.read_body()
                    action = (body.get("action") or "").strip()
                    if action == "copy_current":
                        source_user_id = (body.get("userId") or auth["user"].get("id") or "").strip()
                        return self.send_json(copy_user_config_to_template(source_user_id))
                    if action == "reset":
                        return self.send_json(reset_user_template_config())
                    raise ValueError("不支持的模板操作。")
            if path == "/api/super/template/app" and method == "PATCH":
                cfg = read_user_template_config()
                apply_app_patch(cfg, self.read_body())
                write_user_template_config(cfg)
                return self.send_json(read_user_template_config())
            if path == "/api/super/template/popup" and method == "PATCH":
                cfg = read_user_template_config()
                merged = dict(cfg.get("popup") or {})
                merged.update(self.read_body())
                cfg["popup"] = normalize_popup_settings(merged)
                write_user_template_config(cfg)
                return self.send_json(read_user_template_config())
            if path == "/api/super/template/buttons":
                cfg = read_user_template_config()
                if method == "GET":
                    rows, changed = button_rows(cfg)
                    if changed:
                        write_user_template_config(cfg)
                    return self.send_json(rows)
                body = self.read_body()
                if method == "POST":
                    container = get_container(cfg, body)
                    sections = container.setdefault("sections", [])
                    while len(sections) <= int(body.get("sectionIndex", 0)):
                        sections.append({"title": "默认分组", "buttons": []})
                    payload = dict(body.get("button") or body)
                    sections[int(body.get("sectionIndex", 0))].setdefault("buttons", []).append(new_button(payload))
                elif method == "PATCH":
                    section, button_index = find_button_slot(cfg, body)
                    button = section["buttons"][button_index]
                    old_id = button.get("id") or body.get("id")
                    payload = dict(body.get("button") or body)
                    if old_id:
                        payload["id"] = old_id
                    button.clear()
                    button.update(new_button(payload))
                elif method == "DELETE":
                    section, button_index = find_button_slot(cfg, body)
                    if (section["buttons"][button_index] or {}).get("action") == "script":
                        return self.send_json({"error": "内置功能不能删除，请改为停用。"}, 400)
                    del section["buttons"][button_index]
                else:
                    return self.send_json({"error": "接口不存在"}, 404)
                write_user_template_config(cfg)
                rows, changed = button_rows(cfg)
                if changed:
                    write_user_template_config(cfg)
                return self.send_json(rows)
            return self.send_json({"error": "接口不存在"}, 404)
        if path == "/api/super/users/batch" and method == "POST":
            if not is_super(auth["user"]):
                return self.send_json({"error": "代理不能批量管理账号。"}, 403)
            b = self.read_body()
            ids = set(b.get("ids") or [])
            action = b.get("action")
            if "admin" in ids and action in ("delete", "disable"):
                raise ValueError("默认总管理员不能删除或停用。")
            changed = 0
            if action == "delete":
                before = len(store["users"])
                store["users"] = [u for u in store["users"] if u.get("id") not in ids]
                changed = before - len(store["users"])
            elif action in ("enable", "disable"):
                for user in store["users"]:
                    if user.get("id") in ids:
                        user["active"] = action == "enable"
                        changed += 1
            elif action in ("allow_json", "deny_json"):
                for user in store["users"]:
                    if user.get("id") in ids:
                        user["canViewJson"] = action == "allow_json" or user.get("role") == "super"
                        changed += 1
            else:
                raise ValueError("不支持的批量操作。")
            write_users(store)
            return self.send_json({"ok": True, "changed": changed})
        if path == "/api/super/users/agent" and method == "POST":
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以设置代理身份。"}, 403)
            body = self.read_body()
            user_id = (body.get("id") or "").strip()
            action = (body.get("action") or "").strip()
            if action == "promote":
                balance = None
                if body.get("useDefaultBalance") is not True and "balance" in body:
                    try:
                        balance = float(body.get("balance") or 0)
                    except Exception:
                        raise ValueError("代理余额必须是合法数字。")
                user = promote_user_to_agent(user_id, auth["user"], body.get("useDefaultBalance") is True, balance, "用户管理设为代理")
                return self.send_json(public_user(user, read_users()))
            if action == "cancel":
                user = cancel_user_agent(user_id, auth["user"], "用户管理取消代理")
                return self.send_json(public_user(user, read_users()))
            if action == "balance":
                try:
                    balance = float(body.get("balance") or 0)
                except Exception:
                    raise ValueError("代理余额必须是合法数字。")
                store = read_users()
                user = next((u for u in store.get("users", []) if u.get("id") == user_id), None)
                if not user:
                    raise ValueError("用户不存在。")
                if user.get("role") != "agent":
                    raise ValueError("只有代理用户才能调整代理余额。")
                user["balance"] = balance
                user["updatedAt"] = now_iso()
                write_users(store)
                log_agent_action("balance", user, auth["user"], f"调整代理余额为 {balance:.2f}")
                return self.send_json(public_user(user, store))
            raise ValueError("不支持的代理操作。")
        if path == "/api/super/users":
            if method == "GET":
                return self.send_json({"users": [public_user(u, store) for u in scoped_users(store, auth["user"])]})
            if method == "POST":
                if not is_super(auth["user"]):
                    return self.send_json({"error": "代理不能直接创建账号，请使用邀请码。"}, 403)
                b = self.read_body()
                return self.send_json(public_user(create_user(b.get("username"), b.get("password"), b.get("displayName"), b.get("role"), auth["user"], b.get("email"), "", b.get("balance") or 0)))
            if method == "PATCH":
                b = self.read_body()
                if not is_super(auth["user"]):
                    assert_user_scope(auth["user"], b.get("id"))
                    allowed = {"id": b.get("id")}
                    if "active" in b:
                        allowed["active"] = bool(b.get("active"))
                    b = allowed
                user = update_user_account(b.get("id"), b, True, auth["user"])
                return self.send_json(public_user(user))
            if method == "DELETE":
                if not is_super(auth["user"]):
                    return self.send_json({"error": "代理不能删除账号。"}, 403)
                b = self.read_body()
                if b.get("id") == "admin":
                    raise ValueError("不能删除默认总管理员。")
                store["users"] = [u for u in store["users"] if u.get("id") != b.get("id")]
                write_users(store)
                return self.send_json({"ok": True})
        if path == "/api/super/invites/quote" and method == "POST":
            return self.send_json(invite_quote_for_actor(store, auth["user"], self.read_body()))
        if path == "/api/super/invites":
            if method == "GET":
                invites = store["inviteCodes"]
                if is_agent(auth["user"]):
                    invites = [x for x in invites if x.get("ownerAgentId") == auth["user"].get("id")]
                return self.send_json({"invites": invites})
            if method == "POST":
                b = self.read_body()
                result = create_invites_for_actor(store, auth["user"], b)
                if result.get("created"):
                    write_users(store)
                return self.send_json(result)
            if method == "PATCH":
                b = self.read_body()
                invite = next((x for x in store["inviteCodes"] if x.get("code") == b.get("code")), None)
                if not invite:
                    raise ValueError("邀请码不存在。")
                if is_agent(auth["user"]) and invite.get("ownerAgentId") != auth["user"].get("id"):
                    return self.send_json({"error": "代理不能管理别人的邀请码。"}, 403)
                if "active" in b:
                    invite["active"] = bool(b.get("active"))
                if "maxUses" in b:
                    invite["maxUses"] = max(1, int(b.get("maxUses") or 1))
                if "retentionDays" in b:
                    invite["retentionDays"] = max(0, int(b.get("retentionDays") or 0))
                write_users(store)
                return self.send_json(invite)
            if method == "DELETE":
                b = self.read_body()
                codes = set(b.get("codes") or [])
                if not codes and b.get("code"):
                    codes.add(b.get("code"))
                if is_agent(auth["user"]):
                    codes = {code for code in codes if any(x.get("code") == code and x.get("ownerAgentId") == auth["user"].get("id") for x in store["inviteCodes"])}
                store["inviteCodes"] = [x for x in store["inviteCodes"] if x.get("code") not in codes]
                write_users(store)
                return self.send_json({"ok": True})
        if path == "/api/super/mail":
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以操作。"}, 403)
            if method == "GET":
                return self.send_json(public_mail_settings())
            if method == "PATCH":
                write_mail_settings(self.read_body())
                return self.send_json(public_mail_settings())
        if path == "/api/super/mail/test" and method == "POST":
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以操作。"}, 403)
            body = self.read_body()
            email = (body.get("email") or "").strip()
            if not email:
                raise ValueError("请输入测试收件邮箱。")
            code = str(secrets.randbelow(900000) + 100000)
            if not send_reset_email(email, code):
                raise ValueError("SMTP 未配置完整或发送失败。")
            return self.send_json({"ok": True})
        if path == "/api/super/system":
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以操作。"}, 403)
            if method == "GET":
                return self.send_json(public_system_settings())
            if method == "PATCH":
                return self.send_json(write_system_settings(self.read_body()))
        if path == "/api/super/system/popup/upload" and method == "POST":
            return self.send_json({"error": "联系方式图片只支持图床或外链图片地址，不能本地上传。"}, 400)
        if path == "/api/super/agent-applications":
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以审核代理申请。"}, 403)
            data = read_agent_applications()
            if method == "GET":
                status = (self.query.get("status", ["all"])[0] or "all").strip()
                rows = data.get("applications", [])
                if status in ("pending", "approved", "rejected"):
                    rows = [row for row in rows if row.get("status") == status]
                return self.send_json({"applications": [public_agent_application(row) for row in rows[:500]], "pendingCount": agent_pending_application_count()})
            if method == "PATCH":
                body = self.read_body()
                reviewed = review_agent_application((body.get("id") or "").strip(), (body.get("status") or body.get("action") or "").strip(), auth["user"], body.get("rejectReason") or "")
                return self.send_json(reviewed)
        if path == "/api/super/orders":
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以操作。"}, 403)
            data = read_orders()
            if method == "GET":
                return self.send_json({"orders": [public_order(order) for order in data.get("orders", [])[:200]]})
            if method == "PATCH":
                body = self.read_body()
                order = next((x for x in data.get("orders", []) if x.get("id") == body.get("id")), None)
                if not order:
                    raise ValueError("订单不存在。")
                status = body.get("status") or "pending"
                if status not in ("pending", "paid", "done", "cancelled"):
                    raise ValueError("不支持的订单状态。")
                order["status"] = status
                order["updatedAt"] = now_iso()
                if status in ("paid", "done"):
                    fulfill_invite_order(order, auth["user"])
                write_orders(data)
                return self.send_json(public_order(order))
            if method == "DELETE":
                body = self.read_body()
                ids = {str(x).strip() for x in (body.get("ids") or []) if str(x).strip()}
                order_id = str(body.get("id") or "").strip()
                if order_id:
                    ids.add(order_id)
                if not ids:
                    raise ValueError("请选择要删除的订单。")
                before = len(data.get("orders", []))
                data["orders"] = [x for x in data.get("orders", []) if x.get("id") not in ids]
                deleted = before - len(data.get("orders", []))
                if deleted <= 0:
                    raise ValueError("订单不存在。")
                write_orders(data)
                return self.send_json({"ok": True, "deleted": deleted})
        return self.send_json({"error": "接口不存在"}, 404)

    def handle_admin(self, path, method, auth):
        user_id = target_user_id(auth, self)
        if path == "/api/admin/me" and method == "GET":
            return self.send_json({"user": public_user(auth["user"]), "targetUser": public_user(find_user_by_id(user_id))})
        if path == "/api/admin/agent-application":
            if method == "GET":
                return self.send_json(public_agent_apply_state(auth["user"]))
            if method == "POST":
                application, user, auto_approved = submit_agent_application(auth["user"], self.read_body())
                return self.send_json({
                    "application": application,
                    "user": user,
                    "autoApproved": auto_approved,
                    "message": "申请已通过，你已成为代理。" if auto_approved else "申请已提交，请等待审核。",
                })
        if path == "/api/admin/agent-orders" and method == "GET":
            if not is_agent(auth["user"]):
                return self.send_json({"orders": []})
            data = read_orders()
            orders = [order for order in data.get("orders", []) if order.get("agentId") == auth["user"].get("id")]
            return self.send_json({"orders": [public_order(order) for order in orders[:100]]})
        if path == "/api/admin/notices":
            data = read_notices()
            if method == "GET":
                notices = [n for n in data.get("notices", []) if notice_visible_to_user(n, auth["user"])]
                return self.send_json({"notices": [public_notice(n, auth["user"]["id"]) for n in notices[:80]], "agentPendingCount": agent_pending_application_count() if is_super(auth["user"]) else 0})
            if method == "POST":
                if not is_super(auth["user"]):
                    return self.send_json({"error": "只有总管理员可以发送通知。"}, 403)
                body = self.read_body()
                title = (body.get("title") or "").strip()
                content = (body.get("content") or "").strip()
                if not title and not content:
                    raise ValueError("通知内容不能为空。")
                notice = {
                    "id": new_id("notice"),
                    "title": title or "通知",
                    "content": content,
                    "level": body.get("level") or "info",
                    "active": True,
                    "createdAt": now_iso(),
                    "createdBy": auth["user"].get("username"),
                    "createdByName": user_display_name(auth["user"]),
                    "createdById": auth["user"].get("id"),
                    "readBy": [],
                }
                data["notices"].insert(0, notice)
                write_notices(data)
                response = public_notice(notice, auth["user"]["id"])
                if body.get("mailPush"):
                    store = read_users()
                    recipients = [u for u in store.get("users", []) if (u.get("email") or "").strip() and notice_visible_to_user(notice, u)]
                    ok, message = send_notice_mail_to_users(notice, recipients)
                    if not ok:
                        return self.send_json({"error": f"通知已保存，但邮件发送失败：{message}"}, 400)
                    response["mailMessage"] = f"通知已发送，{message}"
                return self.send_json(response)
            if method == "PATCH":
                body = self.read_body()
                notice = next((n for n in data.get("notices", []) if n.get("id") == body.get("id")), None)
                if not notice:
                    raise ValueError("通知不存在。")
                if body.get("read"):
                    notice.setdefault("readBy", [])
                    if auth["user"]["id"] not in notice["readBy"]:
                        notice["readBy"].append(auth["user"]["id"])
                if body.get("hide") and (is_super(auth["user"]) or notice.get("createdById") == auth["user"].get("id")):
                    notice["active"] = False
                write_notices(data)
                return self.send_json(public_notice(notice, auth["user"]["id"]))
            if method == "DELETE":
                if not is_super(auth["user"]):
                    return self.send_json({"error": "只有总管理员可以删除所有通知。"}, 403)
                body = self.read_body()
                notice_id = (body.get("id") or "").strip()
                if notice_id:
                    before = len(data.get("notices", []))
                    data["notices"] = [n for n in data.get("notices", []) if n.get("id") != notice_id]
                    write_notices(data)
                    return self.send_json({"ok": True, "deleted": before - len(data.get("notices", []))})
                write_notices({"notices": [], "reads": {}})
                return self.send_json({"ok": True, "deleted": True})
        if path == "/api/admin/notices/mail" and method == "POST":
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以邮箱推送通知。"}, 403)
            body = self.read_body()
            notice_id = (body.get("id") or "").strip()
            data = read_notices()
            notice = next((n for n in data.get("notices", []) if n.get("id") == notice_id and n.get("active", True) is not False), None)
            if not notice:
                raise ValueError("通知不存在。")
            store = read_users()
            recipients = [u for u in store.get("users", []) if (u.get("email") or "").strip() and notice_visible_to_user(notice, u)]
            ok, message = send_notice_mail_to_users(notice, recipients)
            if not ok:
                return self.send_json({"error": f"邮件发送失败：{message}"}, 400)
            return self.send_json({"ok": True, "message": message})
        if path == "/api/admin/account" and method == "PATCH":
            b = self.read_body()
            if b.get("password") and not check_password(str(b.get("currentPassword") or ""), auth["user"].get("passwordHash", "")):
                return self.send_json({"error": "当前密码不正确。"}, 400)
            user = update_user_account(auth["user"]["id"], b, False)
            return self.send_json({"user": public_user(user)})
        if path == "/api/admin/desktop/download" and method == "GET":
            if not is_super(auth["user"]):
                return self.send_json({"error": "只有总管理员可以下载后台 EXE。"}, 403)
            name, data = make_admin_desktop_exe(self.base_url())
            if not is_windows_exe(data):
                return self.send_json({"error": "后台 EXE 生成结果无效，请检查服务器编译环境。"}, 500)
            return self.send_bytes(data, "application/vnd.microsoft.portable-executable", filename=name)
        if path == "/api/admin/client/variants" and method == "GET":
            return self.send_json(public_client_variants())
        if path == "/api/admin/client/download" and method == "GET":
            name, data = make_client_exe(find_user_by_id(user_id), self.base_url(), request_client_variant(self))
            if not is_windows_exe(data):
                return self.send_json({"error": "EXE 生成结果无效，请清理缓存后重试。"}, 500)
            return self.send_bytes(data, "application/vnd.microsoft.portable-executable", filename=name)
        if path == "/api/admin/client/build" and method == "POST":
            body = self.read_body()
            user = find_user_by_id(user_id)
            if not user:
                return self.send_json({"error": "目标用户不存在。"}, 404)
            return self.send_json(start_client_build_job(user, self.base_url(), request_client_variant(self, body)))
        if path == "/api/admin/client/build/status" and method == "GET":
            job_id = self.query.get("id", [""])[0]
            job = public_client_build_job(job_id)
            if not job:
                return self.send_json({"error": "生成任务不存在。"}, 404)
            return self.send_json(job)
        if path == "/api/admin/client/build/file" and method == "GET":
            cleanup_client_build_artifacts()
            job_id = self.query.get("id", [""])[0]
            with CLIENT_BUILD_LOCK:
                job = dict(CLIENT_BUILD_JOBS.get(job_id) or {})
            if not job:
                return self.send_json({"error": "生成任务不存在。"}, 404)
            if job.get("status") != "done":
                return self.send_json({"error": "生成任务还未完成。"}, 409)
            file_path = Path(job.get("path") or "")
            if not file_path.exists():
                return self.send_json({"error": "生成文件不存在。"}, 404)
            data = file_path.read_bytes()
            if not is_windows_exe(data):
                return self.send_json({"error": "生成文件不是有效 EXE，请重新生成。"}, 500)
            return self.send_bytes(data, "application/vnd.microsoft.portable-executable", filename=job.get("fileName") or "toolbox.exe")
        if path == "/api/admin/config/export" and method == "GET":
            user = find_user_by_id(user_id) or auth["user"]
            package = config_export_package(read_config(user_id), user, self.base_url())
            data = json.dumps(package, ensure_ascii=False, indent=2).encode("utf-8")
            filename = f"toolbox-config-{ascii_file_name_part(user_display_name(user) or user_id, 'user')}-{int(time.time())}.json"
            return self.send_bytes(data, "application/json; charset=utf-8", filename=filename)
        if path == "/api/admin/config/share" and method == "POST":
            if is_super(auth["user"]) and user_id != auth["user"].get("id"):
                target = find_user_by_id(user_id)
                if not target:
                    return self.send_json({"error": "目标用户不存在。"}, 404)
            share = create_config_share(read_config(user_id), find_user_by_id(user_id) or auth["user"], self.base_url())
            return self.send_json(share)
        if path == "/api/admin/config/import" and method == "POST":
            body = self.read_body()
            source = (body.get("source") or "").strip().lower()
            if source == "url":
                payload = fetch_remote_config_payload(body.get("url") or body.get("shareUrl") or "")
            else:
                payload = body.get("payload") if "payload" in body else body
            cfg = normalize_import_config(payload)
            write_config_for_actor(cfg, user_id, auth["user"])
            return self.send_json({"ok": True, "summary": config_summary(cfg), "config": read_config(user_id)})
        if path == "/api/admin/config":
            if method == "GET":
                return self.send_json(read_config(user_id))
            if method == "PUT":
                write_config_for_actor(self.read_body(), user_id, auth["user"])
                return self.send_json(read_config(user_id))
        if path == "/api/admin/app" and method == "PATCH":
            patch = self.read_body()
            if auth["user"].get("role") != "super":
                for key in ("admin_title", "login_hint"):
                    patch.pop(key, None)
            cfg = read_config(user_id)
            apply_app_patch(cfg, patch)
            write_config_for_actor(cfg, user_id, auth["user"])
            if auth["user"].get("role") == "super" and should_sync_default_config(auth["user"], user_id):
                sync_public_brand_config(patch)
            return self.send_json(cfg)
        if path == "/api/admin/popup" and method == "PATCH":
            cfg = read_config(user_id)
            merged = dict(cfg.get("popup") or {})
            merged.update(self.read_body())
            cfg["popup"] = normalize_popup_settings(merged)
            write_config_for_actor(cfg, user_id, auth["user"])
            return self.send_json(cfg)
        if path == "/api/admin/buttons":
            cfg = read_config(user_id)
            if method == "GET":
                rows, changed = button_rows(cfg)
                if changed:
                    write_config_for_actor(cfg, user_id, auth["user"])
                return self.send_json(rows)
            body = self.read_body()
            if method == "POST":
                container = get_container(cfg, body)
                sections = container.setdefault("sections", [])
                while len(sections) <= int(body.get("sectionIndex", 0)):
                    sections.append({"title": "默认分组", "buttons": []})
                payload = dict(body.get("button") or body)
                sections[int(body.get("sectionIndex", 0))].setdefault("buttons", []).append(new_button(payload))
            elif method == "PATCH":
                section, button_index = find_button_slot(cfg, body)
                button = section["buttons"][button_index]
                old_id = button.get("id") or body.get("id")
                payload = dict(body.get("button") or body)
                if old_id:
                    payload["id"] = old_id
                button.clear()
                button.update(new_button(payload))
            elif method == "DELETE":
                section, button_index = find_button_slot(cfg, body)
                if (section["buttons"][button_index] or {}).get("action") == "script":
                    return self.send_json({"error": "内置功能不能删除，请改为停用。"}, 400)
                del section["buttons"][button_index]
            write_config_for_actor(cfg, user_id, auth["user"])
            rows, changed = button_rows(cfg)
            if changed:
                write_config_for_actor(cfg, user_id, auth["user"])
            return self.send_json(rows)
        return self.send_json({"error": "接口不存在"}, 404)

    def base_url(self):
        proto = self.headers.get("X-Forwarded-Proto") or self.headers.get("X-Forwarded-Scheme") or "http"
        if "," in proto:
            proto = proto.split(",", 1)[0].strip()
        host = self.headers.get("Host") or "localhost:5088"
        return normalize_public_base_url(f"{proto}://{host}")

    def serve_static(self, path):
        rel = path.strip("/") or "index.html"
        file_path = (WWW / rel).resolve()
        if not str(file_path).startswith(str(WWW.resolve())) or not file_path.exists() or not file_path.is_file():
            return self.send_json({"error": "接口不存在"}, 404)
        ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        if ctype.startswith("text/") or file_path.suffix in (".js", ".json"):
            ctype += "; charset=utf-8"
        return self.send_bytes(file_path.read_bytes(), ctype)


if __name__ == "__main__":
    read_users()
    threading.Thread(target=run_client_build_cleanup_loop, daemon=True).start()
    host = os.environ.get("TOOLBOX_HOST", "127.0.0.1")
    port = int(os.environ.get("TOOLBOX_PORT", "5088"))
    print(f"Toolbox admin API started: http://{host}:{port}/", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
