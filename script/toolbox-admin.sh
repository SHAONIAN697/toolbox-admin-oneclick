#!/usr/bin/env bash
set -euo pipefail

SERVICE="toolbox-admin"
REPO="SHAONIAN697/toolbox-admin-oneclick"
BRANCH="main"
CONF="/etc/toolbox-admin-manager.conf"
PROXY=""
[ -f "$CONF" ] && . "$CONF"

green(){ printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
red(){ printf '\033[31m%s\033[0m\n' "$*"; }
pause(){ read -r -p "按 Enter 返回菜单..." _ || true; }
need_root(){ [ "$(id -u)" = 0 ] || { red "请使用 sudo bash 执行"; exit 1; }; }
app_dir(){ systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || true; }

set_proxy(){
  echo "代理填写前缀并以 / 结尾，例如：https://gh-proxy.org/"
  echo "直接回车保留当前配置，输入 none 清除代理。"
  read -r -p "GitHub 代理 [$PROXY]: " value || true
  if [ "$value" = "none" ]; then
    PROXY=""
  elif [ -n "$value" ]; then
    PROXY="$value"
  fi
  [ -z "$PROXY" ] || PROXY="${PROXY%/}/"
  printf 'PROXY=%q\n' "$PROXY" > "$CONF"
  green "代理已保存：${PROXY:-不使用代理}"
}

download_source(){
  local tmp="$1" url="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}"
  mkdir -p "$tmp"
  yellow "正在下载最新版源码..." >&2
  curl -fL --retry 3 --connect-timeout 15 -o "$tmp/source.tar.gz" "${PROXY}${url}"
  tar -xzf "$tmp/source.tar.gz" -C "$tmp"
  find "$tmp" -path '*/src/ToolboxAdminApi-oneclick/install-baota.sh' -print -quit | xargs -r dirname
}

install_or_update(){
  local tmp src
  tmp="$(mktemp -d /tmp/toolbox-admin-manager.XXXXXX)"
  src="$(download_source "$tmp")"
  [ -n "$src" ] && [ -f "$src/install-baota.sh" ] || { red "源码下载或目录识别失败"; rm -rf "$tmp"; return 1; }
  bash "$src/install-baota.sh"
  rm -rf "$tmp"
}

show_status(){ systemctl status "$SERVICE" --no-pager -l || true; }
service_action(){ systemctl "$1" "$SERVICE"; show_status; }

change_password(){
  local dir password
  dir="$(app_dir)"; [ -n "$dir" ] || { red "服务尚未安装"; return; }
  read -r -s -p "输入总管理员新密码（至少 6 位）: " password; echo
  [ "${#password}" -ge 6 ] || { red "密码长度不足"; return; }
  TOOLBOX_NEW_PASSWORD="$password" python3 - "$dir" <<'PY'
import hashlib,json,os,secrets,sys
from pathlib import Path
p=Path(sys.argv[1])/"data/users.json"
d=json.loads(p.read_text(encoding="utf-8"))
salt=secrets.token_hex(16); pwd=os.environ["TOOLBOX_NEW_PASSWORD"]
h="sha256$%s$%s"%(salt,hashlib.sha256((salt+pwd).encode()).hexdigest())
users=d.get("users",[]); admin=next((u for u in users if u.get("username")=="admin"),None)
if not admin: raise SystemExit("未找到 admin 账号")
admin["passwordHash"]=h
p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding="utf-8")
PY
  systemctl restart "$SERVICE"; green "总管理员密码已修改"
}

backup_data(){
  local dir out
  dir="$(app_dir)"; [ -n "$dir" ] || { red "服务尚未安装"; return; }
  mkdir -p /www/backup
  out="/www/backup/toolbox-admin-data-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "$out" -C "$dir" data
  green "备份完成：$out"
}

restore_data(){
  local dir file
  dir="$(app_dir)"; [ -n "$dir" ] || { red "服务尚未安装"; return; }
  read -r -p "输入备份文件完整路径: " file
  [ -f "$file" ] || { red "备份文件不存在"; return; }
  systemctl stop "$SERVICE"
  mv "$dir/data" "$dir/data.before-restore-$(date +%Y%m%d-%H%M%S)"
  tar -xzf "$file" -C "$dir"
  systemctl start "$SERVICE"
  green "数据恢复完成"
}

uninstall_app(){
  local dir answer
  dir="$(app_dir)"; read -r -p "确认卸载？输入 YES: " answer
  [ "$answer" = YES ] || return
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE}.service"; systemctl daemon-reload
  yellow "服务已卸载，程序及 data 保留在：$dir"
}

menu(){
  while true; do
    clear
    echo "欢迎使用 Toolbox Admin 管理脚本"
    echo
    green "基础功能："
    echo "1. 安装 Toolbox Admin"
    echo "2. 更新 Toolbox Admin"
    echo "3. 卸载 Toolbox Admin"
    echo "------------------------"
    green "服务管理："
    echo "4. 查看状态"
    echo "5. 修改总管理员密码"
    echo "6. 启动服务"
    echo "7. 停止服务"
    echo "8. 重启服务"
    echo "------------------------"
    green "配置管理："
    echo "9. 配置 GitHub 代理"
    echo "10. 备份数据"
    echo "11. 恢复数据"
    echo "------------------------"
    echo "0. 退出脚本"
    echo
    read -r -p "请输入选项 [0-11]: " choice
    case "$choice" in
      1|2) install_or_update; pause;;
      3) uninstall_app; pause;;
      4) show_status; pause;;
      5) change_password; pause;;
      6) service_action start; pause;;
      7) service_action stop; pause;;
      8) service_action restart; pause;;
      9) set_proxy; pause;;
      10) backup_data; pause;;
      11) restore_data; pause;;
      0) exit 0;;
      *) red "无效选项"; sleep 1;;
    esac
  done
}

need_root
menu
