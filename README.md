# 工具箱后台无代理版

本分支保存的是最新无代理版工具箱后台源码和宝塔一键更新包。无代理版已移除业务代理/代理申请/代理订单相关入口，保留后台管理、用户配置、邀请码、通知、客户端生成、三套客户端版本、软件大全、配置导入导出和云端配置链接等功能。

## 当前最新版

- 无代理一键包：`packages/toolbox-admin-baota-oneclick-no-agent-fixed2-20260624.tar.gz`
- 无代理一键包 Base64：`packages/toolbox-admin-baota-oneclick-no-agent-fixed2-20260624.tar.gz.b64`
- 无代理源码包：`packages/toolbox-admin-source-no-agent-fixed2-20260624.tar.gz`
- 无代理源码目录：`src/ToolboxAdminApi-no-agent`
- SHA256 清单：`docs/更新包SHA256清单.txt`

本仓库不提交服务器运行数据目录 `data/`，避免覆盖已部署服务器上的账号、密码、用户配置、通知、订单、系统设置和客户端生成记录。

## 更新重点

- 移除业务代理功能入口和代理申请接口。
- 修复无代理版后台登录后前端脚本解析失败的问题。
- 修复读取附加接口失败时阻断主配置加载的问题，旧服务入口返回 `Not found` 时不再卡死后台。
- 已部署服务器更新时保留原 `data/`，只替换程序文件。
- 保留三套客户端生成：默认版、工作台版、门户版。
- 保留软件大全、页面访问密码、配置导入导出、云端配置链接、通知、邀请码、后台桌面 EXE 等功能。

## 首次部署

新服务器第一次安装可使用一键包。首次部署会初始化新的 `data/` 数据目录。

```bash
cd /www/wwwroot && rm -rf toolbox-admin-oneclick toolbox-admin-oneclick.tar.gz toolbox-admin-oneclick.tar.gz.b64 && mkdir -p toolbox-admin-oneclick && curl -L --retry 5 --retry-delay 3 -o toolbox-admin-oneclick.tar.gz.b64 "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/private-local-tested-preserve-data-20260620/packages/toolbox-admin-baota-oneclick-no-agent-fixed2-20260624.tar.gz.b64" && if command -v base64 >/dev/null 2>&1; then base64 -d toolbox-admin-oneclick.tar.gz.b64 > toolbox-admin-oneclick.tar.gz; else python3 -c "import base64,pathlib; pathlib.Path('toolbox-admin-oneclick.tar.gz').write_bytes(base64.b64decode(pathlib.Path('toolbox-admin-oneclick.tar.gz.b64').read_text()))"; fi && tar -xzf toolbox-admin-oneclick.tar.gz -C toolbox-admin-oneclick --strip-components=1 && cd toolbox-admin-oneclick && bash install-baota.sh
```

执行后按提示填写域名、安装目录、端口和管理员密码。新服务器没有旧数据时才使用这条命令。

## 已部署服务器更新

已经部署过的服务器不要重新跑首次部署命令。直接复制下面整段命令粘贴到宝塔终端执行；它只覆盖程序文件，保留服务器原来的 `data/`。

```bash
set -e
SERVICE="toolbox-admin"
APP="$(systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || true)"
[ -n "$APP" ] && [ "$APP" != "/" ] || APP="/www/wwwroot/gjx.vst76.cn"
BRANCH="private-local-tested-preserve-data-20260620"
PKG_NAME="toolbox-admin-baota-oneclick-no-agent-fixed2-20260624.tar.gz"
URL_RAW="https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/${BRANCH}/packages/${PKG_NAME}"
URL_GITHUB="https://github.com/SHAONIAN697/toolbox-admin-oneclick/raw/${BRANCH}/packages/${PKG_NAME}"
URL_CODELOAD="https://codeload.github.com/SHAONIAN697/toolbox-admin-oneclick/tar.gz/refs/heads/${BRANCH}"
SHA="7790f841e311fd4989c90d5f957198038d988491d0e7d4eaa0851a89b97d611b"
TS="$(date +%Y%m%d-%H%M%S)"
PKG="/tmp/toolbox-no-agent-$TS.tar.gz"
TMP="/tmp/toolbox-no-agent-$TS"
REPO_TMP="/tmp/toolbox-no-agent-repo-$TS"
BACKUP="/www/backup/toolbox-no-agent-$TS"

mkdir -p "$TMP" "$BACKUP" "$REPO_TMP"
[ -d "$APP" ] || { echo "APP dir not found: $APP"; exit 1; }
[ -d "$APP/data" ] || { echo "Existing data dir not found: $APP/data"; exit 1; }

download_codeload() {
  local repo_pkg="/tmp/toolbox-no-agent-repo-$TS.tar.gz"
  echo "Downloading from codeload branch archive..."
  rm -f "$repo_pkg"
  rm -rf "$REPO_TMP"
  mkdir -p "$REPO_TMP"
  curl -L --fail --retry 2 --connect-timeout 8 --speed-limit 20480 --speed-time 20 --max-time 180 -o "$repo_pkg" "$URL_CODELOAD" || return 1
  tar -xzf "$repo_pkg" -C "$REPO_TMP" || return 1
  local found
  found="$(find "$REPO_TMP" -path "*/packages/$PKG_NAME" -type f | head -n 1)"
  [ -n "$found" ] || return 1
  cp "$found" "$PKG"
}

download_direct() {
  local url="$1"
  echo "Downloading direct package: $url"
  rm -f "$PKG"
  curl -L --fail --retry 1 --connect-timeout 8 --speed-limit 20480 --speed-time 15 --max-time 60 -o "$PKG" "$url"
}

download_git() {
  command -v git >/dev/null 2>&1 || return 1
  echo "Downloading through git clone fallback..."
  rm -rf "$REPO_TMP"
  git clone --depth 1 --branch "$BRANCH" "https://github.com/SHAONIAN697/toolbox-admin-oneclick.git" "$REPO_TMP"
  [ -f "$REPO_TMP/packages/$PKG_NAME" ] || return 1
  cp "$REPO_TMP/packages/$PKG_NAME" "$PKG"
}

download_codeload || download_direct "$URL_RAW" || download_direct "$URL_GITHUB" || download_git || { echo "Download failed from all sources"; exit 1; }
echo "$SHA  $PKG" | sha256sum -c -
tar -xzf "$PKG" -C "$TMP"
SRC="$TMP/ToolboxAdminApi-oneclick"
python3 -m py_compile "$SRC/app.py"

cd "$APP"
cp -a app.py wwwroot client-template assets deploy admin-desktop-template "$BACKUP/" 2>/dev/null || true
cp -a data "$BACKUP/data.current" 2>/dev/null || true

rm -rf app.py wwwroot client-template assets deploy admin-desktop-template __pycache__ data/client-cache data/client-jobs
\cp -a "$SRC/app.py" "$APP/app.py"
\cp -a "$SRC/wwwroot" "$APP/wwwroot"
\cp -a "$SRC/client-template" "$APP/client-template"
\cp -a "$SRC/assets" "$APP/assets"
\cp -a "$SRC/deploy" "$APP/deploy"
\cp -a "$SRC/admin-desktop-template" "$APP/admin-desktop-template"
[ -d "$BACKUP/wwwroot/uploads" ] && mkdir -p "$APP/wwwroot" && rm -rf "$APP/wwwroot/uploads" && \cp -a "$BACKUP/wwwroot/uploads" "$APP/wwwroot/uploads"

test -f "$APP/data/users.json"
test -f "$APP/data/config.json"
python3 -m json.tool "$APP/data/users.json" >/dev/null
python3 -m json.tool "$APP/data/config.json" >/dev/null

systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE"
curl -fsS "http://127.0.0.1:5088/api/public/brand" >/dev/null
grep -q "function loadOptional" "$APP/wwwroot/admin.js"
! grep -q "/api/admin/agent-application" "$APP/app.py"
echo "OK: no-agent build updated, existing data preserved. Backup: $BACKUP"
```

这条更新命令会：

- 自动识别 `toolbox-admin` 当前 `WorkingDirectory`。
- 要求已有 `data/` 目录存在，否则直接退出。
- 备份当前程序文件和当前 `data` 到 `/www/backup/toolbox-no-agent-*`。
- 只替换 `app.py`、`wwwroot`、`client-template`、`assets`、`deploy`、`admin-desktop-template`。
- 只清理 `data/client-cache` 和 `data/client-jobs`。
- 校验 `data/users.json` 和 `data/config.json` 是合法 JSON 后再重启服务。

## 数据保留

更新模式会保留服务器上的：

- 后台账号和密码
- 用户列表和邀请码
- 每个用户的工具箱配置
- 通知、订单、系统设置
- 邮件设置、云端配置链接
- 已上传图片和静态资源

不会保留的是客户端生成缓存，因为更新后需要重新生成并下载客户端 EXE。

## 目录说明

```text
src/ToolboxAdminApi-no-agent/          无代理版源码
packages/                              一键包、源码包和热修复包
docs/GitHub无代理版-已部署服务器保留数据更新命令.txt
docs/更新包SHA256清单.txt
```

## 注意

GitHub 的私密性是仓库级别，不是分支级别。如果需要私密，请将整个仓库设置为 Private。

