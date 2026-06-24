#!/usr/bin/env bash
set -euo pipefail

APP_NAME="toolbox-admin"
DEFAULT_PORT="5088"

red() { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

need_root() {
  if [ "$(id -u)" != "0" ]; then
    red "请使用 root 用户执行：sudo bash install-baota.sh"
    exit 1
  fi
}

ask() {
  local prompt="$1"
  local default="$2"
  local value
  read -r -p "$prompt [$default]: " value || true
  printf "%s" "${value:-$default}"
}

random_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 18 | tr -d '=+/[:space:]' | cut -c1-18
  else
    date +%s%N | sha256sum | cut -c1-18
  fi
}

service_file() {
  printf "/etc/systemd/system/%s.service" "$APP_NAME"
}

detect_service_workdir() {
  local file
  file="$(service_file)"
  [ -f "$file" ] || return 0
  grep -E "^WorkingDirectory=" "$file" | tail -n 1 | sed 's/^WorkingDirectory=//; s/^"//; s/"$//'
}

detect_service_env() {
  local key="$1"
  local file
  file="$(service_file)"
  [ -f "$file" ] || return 0
  grep -E "^Environment=${key}=" "$file" | tail -n 1 | sed "s/^Environment=${key}=//; s/^\"//; s/\"$//"
}

install_deps() {
  yellow "正在安装运行依赖：python3..."
  if command -v apt >/dev/null 2>&1; then
    apt update
    DEBIAN_FRONTEND=noninteractive apt install -y python3
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y python3
  elif command -v yum >/dev/null 2>&1; then
    yum install -y python3
  else
    red "未识别包管理器，请手动安装 python3 后重试。"
    exit 1
  fi

  if command -v mcs >/dev/null 2>&1 || command -v csc >/dev/null 2>&1; then
    green "已检测到 C# 编译器，支持在线生成工具箱 EXE。"
    return 0
  fi

  yellow "未检测到 C# 编译器。后台会继续部署；如需在线生成/下载 EXE，请之后手动安装 mono-devel 并重启 ${APP_NAME}。"
}

copy_source() {
  local src_dir="$1"
  local app_dir="$2"

  mkdir -p "$app_dir"

  if [ -d "$app_dir/data" ]; then
    local bak="$app_dir/data.bak.$(date +%Y%m%d%H%M%S)"
    yellow "检测到已有 data 数据目录，自动备份到：$bak"
    cp -a "$app_dir/data" "$bak"
  fi

  yellow "正在复制程序文件到：$app_dir"
  cp -a "$src_dir/app.py" "$app_dir/"
  cp -a "$src_dir/assets" "$app_dir/"
  cp -a "$src_dir/client-template" "$app_dir/"
  cp -a "$src_dir/wwwroot" "$app_dir/"
  cp -a "$src_dir/admin-desktop-template" "$app_dir/" 2>/dev/null || true
  cp -a "$src_dir/deploy" "$app_dir/" 2>/dev/null || true
  cp -a "$src_dir/README.md" "$app_dir/" 2>/dev/null || true
  cp -a "$src_dir/DOCKING.md" "$app_dir/" 2>/dev/null || true
  cp -a "$src_dir/宝塔部署教程.md" "$app_dir/" 2>/dev/null || true
  cp -a "$src_dir/使用教程-录屏版.md" "$app_dir/" 2>/dev/null || true

  if [ ! -d "$app_dir/data" ]; then
    cp -a "$src_dir/data" "$app_dir/"
  fi

  mkdir -p "$app_dir/data" "$app_dir/data/users"
}

write_service() {
  local app_dir="$1"
  local port="$2"
  local password="$3"

  yellow "正在创建 systemd 服务..."
  cat >/etc/systemd/system/${APP_NAME}.service <<EOF
[Unit]
Description=Toolbox Admin API
After=network.target

[Service]
Type=simple
WorkingDirectory=${app_dir}
Environment=TOOLBOX_HOST=127.0.0.1
Environment=TOOLBOX_PORT=${port}
Environment=TOOLBOX_ADMIN_TOKEN=${password}
ExecStart=/usr/bin/python3 ${app_dir}/app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable ${APP_NAME} >/dev/null
  systemctl restart ${APP_NAME}
}

patch_nginx() {
  local domain="$1"
  local port="$2"
  local conf="/www/server/panel/vhost/nginx/${domain}.conf"
  local marker_begin="# toolbox-admin one-click begin"
  local marker_end="# toolbox-admin one-click end"

  if [ ! -f "$conf" ]; then
    yellow "未找到宝塔 Nginx 站点配置：$conf"
    yellow "请在宝塔里添加网站 ${domain} 后，再运行一次本脚本。"
    return 1
  fi

  local backup="${conf}.bak.$(date +%Y%m%d%H%M%S)"
  cp -a "$conf" "$backup"

  python3 - "$conf" "$port" "$marker_begin" "$marker_end" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
port = sys.argv[2]
begin = sys.argv[3]
end = sys.argv[4]
text = path.read_text(encoding="utf-8", errors="ignore")

block = f"""
    {begin}
    location = /api {{
        return 308 /api/;
    }}

    location ^~ /api/ {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
        expires off;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    }}

    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
    {end}
"""

text = re.sub(r"\n\s*# toolbox-admin one-click begin.*?# toolbox-admin one-click end\s*\n", "\n", text, flags=re.S)

def remove_location_blocks(src):
    out = []
    i = 0
    n = len(src)
    loc_re = re.compile(r"(?m)^[ \t]*location[ \t]+(?:=[ \t]+|\^~[ \t]+|~\*?[ \t]+)?(/api(?:/|\b)[^\s{]*|/(?=\s|\{))[^{]*\{")
    while i < n:
        m = loc_re.search(src, i)
        if not m:
            out.append(src[i:])
            break
        out.append(src[i:m.start()])
        depth = 0
        j = m.end() - 1
        while j < n:
            ch = src[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    j += 1
                    while j < n and src[j] in " \t\r\n":
                        j += 1
                    break
            j += 1
        i = j
    return "".join(out)

text = remove_location_blocks(text)
idx = text.rfind("\n}")
if idx == -1:
    raise SystemExit("无法定位 Nginx server 结束位置")
text = text[:idx] + "\n" + block + text[idx:]
path.write_text(text, encoding="utf-8")
PY

  if nginx -t; then
    systemctl reload nginx || service nginx reload
    green "Nginx 反向代理已自动配置。"
    return 0
  fi

  cp -a "$backup" "$conf"
  nginx -t >/dev/null 2>&1 && (systemctl reload nginx || service nginx reload) >/dev/null 2>&1 || true
  red "Nginx 配置检测失败，已自动恢复原配置。"
  yellow "请在宝塔面板手动添加反向代理：http://127.0.0.1:${port}"
  return 1
}

main() {
  need_root

  local script_dir
  script_dir="$(cd "$(dirname "$0")" && pwd)"

  if [ ! -f "$script_dir/app.py" ]; then
    red "请先解压源码包，并在源码目录里执行：bash install-baota.sh"
    exit 1
  fi

  echo
  green "=== 梳理工具箱一键部署脚本 ==="
  echo

  local existing_app_dir
  existing_app_dir="$(detect_service_workdir || true)"
  local existing_port
  existing_port="$(detect_service_env TOOLBOX_PORT || true)"
  local existing_token
  existing_token="$(detect_service_env TOOLBOX_ADMIN_TOKEN || true)"

  if [ -n "$existing_app_dir" ] && [ -d "$existing_app_dir/data" ]; then
    yellow "检测到已部署目录：$existing_app_dir"
    yellow "本次默认按更新模式执行，保留账号密码、后台配置和用户数据。"
    echo
  fi

  local default_domain="gjx.vst76.cn"
  if [ -n "$existing_app_dir" ]; then
    default_domain="$(basename "$existing_app_dir")"
  fi
  local domain
  domain="$(ask "请输入绑定的域名" "$default_domain")"
  local default_app_dir="/www/wwwroot/${domain}"
  if [ -n "$existing_app_dir" ]; then
    default_app_dir="$existing_app_dir"
  fi
  local app_dir
  app_dir="$(ask "请输入安装目录" "$default_app_dir")"
  if [ -n "$existing_app_dir" ] && [ -d "$existing_app_dir/data" ] && [ "$app_dir" != "$existing_app_dir" ]; then
    yellow "检测到原部署目录已有 data 数据，为避免更新后账号和配置丢失，自动使用原安装目录：$existing_app_dir"
    app_dir="$existing_app_dir"
  fi
  local default_port="$DEFAULT_PORT"
  if [ -n "$existing_port" ]; then
    default_port="$existing_port"
  fi
  local port
  port="$(ask "请输入本机服务端口" "$default_port")"
  local is_update="0"
  if [ -f "$app_dir/data/users.json" ]; then
    is_update="1"
  fi
  local password
  if [ "$is_update" = "1" ]; then
    password="${existing_token:-$(random_password)}"
    yellow "已进入更新模式：后台账号、密码、用户列表、邀请码和工具箱配置都会保留。"
  else
    local password_default
    password_default="$(random_password)"
    password="$(ask "请输入后台管理员密码，直接回车自动生成" "$password_default")"
  fi

  install_deps
  copy_source "$script_dir" "$app_dir"
  write_service "$app_dir" "$port" "$password"
  patch_nginx "$domain" "$port" || true

  echo
  green "=== 部署完成 ==="
  echo "后台地址：http://${domain}"
  echo "管理员账号：admin"
  if [ "$is_update" = "1" ]; then
    echo "管理员密码：保持原密码不变"
  else
    echo "管理员密码：${password}"
  fi
  echo
  echo "服务状态命令：systemctl status ${APP_NAME} --no-pager -l"
  echo "重启命令：systemctl restart ${APP_NAME}"
  echo
  yellow "如果域名已经开启 HTTPS，请用 https://${domain} 访问。"
  yellow "登录后建议先到“账号”里修改管理员资料，再到“对接”下载工具箱 EXE。"
}

main "$@"
