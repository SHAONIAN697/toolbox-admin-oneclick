#!/usr/bin/env bash
set -euo pipefail

SERVICE="toolbox-admin"
REPO="SHAONIAN697/toolbox-admin-oneclick"
BRANCH="main"
PROXY=""

green(){ printf '\033[1;92m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
red(){ printf '\033[31m%s\033[0m\n' "$*"; }
pause(){ read -r -p "按 Enter 返回菜单..." _ || true; }
need_root(){ [ "$(id -u)" = 0 ] || { red "请使用 sudo toolbox-admin 执行"; exit 1; }; }
app_dir(){ systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || true; }

prepare_interactive_terminal(){
  if [ -r /dev/tty ] && [ -w /dev/tty ]; then
    exec </dev/tty
  fi
}

unlock_manager_target(){
  local target="$1"
  command -v chattr >/dev/null 2>&1 && chattr -i "$target" 2>/dev/null || true
  chmod u+w "$target" 2>/dev/null || true
}

install_manager_command(){
  local target="/usr/local/bin/toolbox-admin" source staged
  source="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
  unlock_manager_target "$target"
  if [ "$source" != "$target" ]; then
    staged="${target}.new.$$"
    install -m 755 "$source" "$staged" || return 1
    mv -f "$staged" "$target" || { rm -f "$staged"; return 1; }
  else
    chmod 755 "$target" || return 1
  fi
}

is_installed(){
  local dir
  dir="$(app_dir)"
  [ -n "$dir" ] && [ "$dir" != "/" ] && [ -f "$dir/app.py" ]
}

ask_proxy(){
  PROXY=""
  echo "如需 GitHub 加速，请输入代理地址，例如：https://gh-proxy.com/"
  read -r -p "代理地址（直接回车不使用代理）: " PROXY || true
  [ -z "$PROXY" ] || PROXY="${PROXY%/}/"
  [ -n "$PROXY" ] && green "本次使用代理：$PROXY" || green "本次不使用代理"
}

download_source(){
  local tmp="$1" sha url api_url="https://api.github.com/repos/${REPO}/commits/${BRANCH}"
  mkdir -p "$tmp"
  yellow "正在读取 GitHub 最新提交..." >&2
  sha="$(curl -fsSL --retry 3 --connect-timeout 15 --max-time 60 -H 'Accept: application/vnd.github+json' "${PROXY}${api_url}" 2>/dev/null | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]*\)".*/\1/p' | head -n 1 || true)"
  if [ "${#sha}" -lt 40 ]; then
    sha="$(curl -fsSL --retry 3 --connect-timeout 15 --max-time 60 -H 'Accept: application/vnd.github+json' "$api_url" 2>/dev/null | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]*\)".*/\1/p' | head -n 1 || true)"
  fi
  [ "${#sha}" -ge 40 ] || return 1
  url="https://codeload.github.com/${REPO}/tar.gz/${sha}"
  yellow "正在下载最新版源码..." >&2
  curl -fL --retry 3 --connect-timeout 15 --max-time 180 -o "$tmp/source.tar.gz" "${PROXY}${url}" || return 1
  tar -xzf "$tmp/source.tar.gz" -C "$tmp" || return 1
  find "$tmp" -path '*/src/ToolboxAdminApi-oneclick/install-baota.sh' -print -quit | xargs -r dirname
}

source_matches_installed(){
  local src="$1" dir="$2" path relative
  [ -f "$dir/app.py" ] && cmp -s "$src/app.py" "$dir/app.py" || return 1
  for path in assets client-template wwwroot admin-desktop-template deploy; do
    [ -d "$src/$path" ] || continue
    while IFS= read -r -d '' relative; do
      relative="${relative#"$src/"}"
      [ -f "$dir/$relative" ] && cmp -s "$src/$relative" "$dir/$relative" || return 1
    done < <(find "$src/$path" -type f -print0)
  done
}

run_install_or_update(){
  local mode="$1" tmp src dir
  ask_proxy
  tmp="$(mktemp -d /tmp/toolbox-admin-manager.XXXXXX)"
  if ! src="$(download_source "$tmp")" || [ -z "$src" ] || [ ! -f "$src/install-baota.sh" ]; then
    red "源码下载失败，请检查网络或输入 GitHub 代理后重试。"
    rm -rf "$tmp"
    return 0
  fi
  if [ "$mode" = "update" ]; then
    dir="$(app_dir)"
    yellow "正在检查当前版本..."
    if [ "${FORCE_UPDATE:-0}" != "1" ] && source_matches_installed "$src" "$dir"; then
      green "当前已是最新版本，无需更新。"
      rm -rf "$tmp"
      return 0
    fi
    yellow "检测到新版本，开始更新..."
  fi
  if ! bash "$src/install-baota.sh"; then
    red "安装或更新失败，请查看上方错误信息。"
    rm -rf "$tmp"
    return 0
  fi
  rm -rf "$tmp"
}

install_app(){
  if is_installed; then
    yellow "此位置已经安装，请选择 2 使用更新命令。"
    return
  fi
  run_install_or_update install
}

update_app(){
  if ! is_installed; then
    yellow "尚未检测到已安装的 Toolbox Admin，请选择 1 安装。"
    return
  fi
  FORCE_UPDATE=1 run_install_or_update update
}

show_status(){ systemctl status "$SERVICE" --no-pager -l || true; }
service_action(){ systemctl "$1" "$SERVICE"; show_status; }

change_password(){
  local dir password password_confirm target choice result
  local -a admins
  dir="$(app_dir)"; [ -n "$dir" ] || { red "服务尚未安装"; return; }
  mapfile -t admins < <(python3 - "$dir" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1])/"data/users.json"
d=json.loads(p.read_text(encoding="utf-8"))
for user in d.get("users", []):
    if isinstance(user, dict) and user.get("role") == "super" and user.get("active", True) is not False:
        username = str(user.get("username") or "").strip()
        if username:
            print(username)
PY
  )
  [ "${#admins[@]}" -gt 0 ] || { red "未找到启用中的超级管理员账号"; return; }
  for choice in "${!admins[@]}"; do
    admins[$choice]="${admins[$choice]%$'\r'}"
  done
  if [ "${#admins[@]}" -eq 1 ]; then
    target="${admins[0]}"
  else
    yellow "检测到多个启用中的超级管理员，请选择要修改的账号："
    for choice in "${!admins[@]}"; do
      printf '%d. %s\n' "$((choice + 1))" "${admins[$choice]}"
    done
    read -r -p "请输入序号 [1-${#admins[@]}]: " choice
    [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#admins[@]}" ] || { red "选择无效"; return; }
    target="${admins[$((choice - 1))]}"
  fi
  green "将修改超级管理员账号：$target"
  read -r -s -p "输入新密码（至少 10 位）: " password; echo
  password="${password%$'\r'}"
  [ "${#password}" -ge 10 ] || { red "密码长度不足，至少需要 10 位"; return; }
  read -r -s -p "再次输入新密码: " password_confirm; echo
  password_confirm="${password_confirm%$'\r'}"
  [ "$password" = "$password_confirm" ] || { red "两次输入的密码不一致"; return; }
  if ! result="$(export TOOLBOX_NEW_PASSWORD="$password" TOOLBOX_ADMIN_USERNAME="$target"; python3 - "$dir" <<'PY'
import hashlib,json,os,secrets,sys
from pathlib import Path

root=Path(sys.argv[1])
users_path=root/"data/users.json"
sessions_path=root/"data/sessions.json"
data=json.loads(users_path.read_text(encoding="utf-8"))
target=os.environ["TOOLBOX_ADMIN_USERNAME"]
admin=next((u for u in data.get("users", [])
            if isinstance(u, dict) and u.get("username") == target
            and u.get("role") == "super" and u.get("active", True) is not False), None)
if not admin:
    raise SystemExit("目标超级管理员不存在或已停用")

salt=secrets.token_bytes(16)
digest=hashlib.pbkdf2_hmac("sha256", os.environ["TOOLBOX_NEW_PASSWORD"].encode(), salt, 310000).hex()
admin["passwordHash"]=f"pbkdf2_sha256$310000${salt.hex()}${digest}"

def write_json_atomic(path, value):
    temporary=path.with_name(path.name+f".tmp.{os.getpid()}")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    if path.exists():
        os.chmod(temporary, path.stat().st_mode)
    os.replace(temporary, path)

revoked=0
sessions={}
if sessions_path.exists():
    loaded=json.loads(sessions_path.read_text(encoding="utf-8"))
    if isinstance(loaded, dict):
        sessions=loaded
        expired=[token for token,row in sessions.items()
                 if isinstance(row, dict) and row.get("userId") == admin.get("id")]
        for token in expired:
            sessions.pop(token, None)
        revoked=len(expired)

write_json_atomic(users_path, data)
if sessions_path.exists() and revoked:
    write_json_atomic(sessions_path, sessions)
print(f"{target}|{revoked}")
PY
  )"; then
    red "密码修改失败，请检查 data/users.json 是否完整。"
    return
  fi
  if systemctl restart "$SERVICE"; then
    green "超级管理员 ${result%%|*} 的密码已修改，已撤销 ${result##*|} 个旧登录会话。"
  else
    red "密码已经写入，但服务重启失败，请执行：systemctl restart $SERVICE"
  fi
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
    printf '欢迎使用 \033[1;96mToolbox Admin\033[0m 管理脚本\n'
    echo
    green "基础功能:"
    green "----------------------"
    green "1. 安装 Toolbox Admin"
    green "2. 更新 Toolbox Admin"
    green "3. 卸载 Toolbox Admin"
    echo
    green "服务管理:"
    green "----------------------"
    green "4. 查看状态"
    green "5. 修改管理员密码"
    green "6. 启动服务"
    green "7. 停止服务"
    green "8. 重启服务"
    echo
    green "配置管理:"
    green "----------------------"
    green "9. 备份数据"
    green "10. 恢复数据"
    echo
    green "----------------------"
    green "0. 退出脚本"
    echo
    printf '请输入选项 \033[1m[0-10]\033[0m: '
    read -r choice
    case "$choice" in
      1) install_app; pause;;
      2) update_app; pause;;
      3) uninstall_app; pause;;
      4) show_status; pause;;
      5) change_password; pause;;
      6) service_action start; pause;;
      7) service_action stop; pause;;
      8) service_action restart; pause;;
      9) backup_data; pause;;
      10) restore_data; pause;;
      0) exit 0;;
      *) red "无效选项"; sleep 1;;
    esac
  done
}

if [ "${TOOLBOX_ADMIN_SOURCE_ONLY:-0}" != "1" ]; then
  need_root
  if ! install_manager_command; then
    yellow "管理命令暂时无法写入 /usr/local/bin，本次继续运行已下载的新脚本。"
    yellow "可稍后执行：chattr -i /usr/local/bin/toolbox-admin"
  fi
  prepare_interactive_terminal
  menu
fi
