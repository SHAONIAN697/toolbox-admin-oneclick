# 工具箱后台一键部署版

这是一个用于管理 Windows 工具箱客户端的网页后台。后台可以配置工具箱标题、主题、按钮、下载项、系统工具、用户账号、代理邀请码、订单审批、通知和隐藏入口弹窗，并为不同用户生成专属 EXE 客户端。

## 最新功能

- 多用户和代理管理：总管理员可管理用户、代理、余额、邀请码和订单。
- 邀请码订单流程：余额不足时先创建订单，必须总管理员审批后才能生成邀请码。
- 支付接口配置：系统设置中支持多套支付接口配置，代理端可选择余额或接口支付。
- 通知中心：支持未读状态、登录弹窗、单条删除、全部删除、邮件推送指定通知。
- 自定义页面和按钮：支持页面位置、按钮分组、下载记录、系统工具和自定义脚本。
- 隐藏入口弹窗：连续点击客户端左上角 Logo 可打开“联系我们 / 支持作者”弹窗，内容由后台配置。
- 主题自适配：后台通知框、隐藏入口弹窗和客户端界面跟随当前主题，浅色深色自动适配。
- 编译校验：后台生成的 EXE 会校验编译签名和文件哈希，防止篡改。
- 多电脑运行：同一个正版 EXE 可发给多台电脑运行，不绑定下载电脑；旧版 EXE 需要重新下载。
- 手机端适配：后台表单、通知、邀请码、订单和复制操作已优化移动端显示。

## 首次部署

新服务器第一次安装时使用这条命令。它会下载程序、安装依赖、创建 systemd 服务，并初始化后台数据。

```bash
cd /www/wwwroot && rm -rf toolbox-admin-oneclick toolbox-admin-oneclick.tar.gz toolbox-admin-oneclick.tar.gz.b64 && mkdir -p toolbox-admin-oneclick && curl -L --retry 5 --retry-delay 3 -o toolbox-admin-oneclick.tar.gz.b64 "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/toolbox-admin-baota-oneclick.tar.gz.b64" && if command -v base64 >/dev/null 2>&1; then base64 -d toolbox-admin-oneclick.tar.gz.b64 > toolbox-admin-oneclick.tar.gz; else python3 -c "import base64,pathlib; pathlib.Path('toolbox-admin-oneclick.tar.gz').write_bytes(base64.b64decode(pathlib.Path('toolbox-admin-oneclick.tar.gz.b64').read_text()))"; fi && ls -lh toolbox-admin-oneclick.tar.gz && tar -xzf toolbox-admin-oneclick.tar.gz -C toolbox-admin-oneclick --strip-components=1 && cd toolbox-admin-oneclick && bash install-baota.sh
```

执行后按提示填写：

- 绑定域名：填写客户自己的域名。
- 安装目录：首次部署可直接回车。
- 服务端口：默认 `5088`。
- 管理员密码：首次部署可填写或回车自动生成。

## 已部署服务器更新

已经部署过的服务器不要重新跑首次部署命令。更新时使用下面这条命令，它只覆盖程序文件，保留服务器上的账号、密码、用户、配置、订单、通知和 `data/` 数据目录。

```bash
set -e; cd /tmp; rm -rf toolbox-admin-oneclick toolbox-admin-baota-oneclick.tar.gz; curl -L -o toolbox-admin-baota-oneclick.tar.gz https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/toolbox-admin-baota-oneclick.tar.gz; tar -xzf toolbox-admin-baota-oneclick.tar.gz; APP="$(systemctl show toolbox-admin -p WorkingDirectory --value 2>/dev/null || true)"; [ -n "$APP" ] && [ "$APP" != "/" ] || APP="/www/wwwroot/gjx.vst76.cn"; TS="$(date +%Y%m%d-%H%M%S)"; mkdir -p "/www/backup/toolbox-admin-update-$TS"; cp -a "$APP/app.py" "$APP/wwwroot" "$APP/client-template" "/www/backup/toolbox-admin-update-$TS/" 2>/dev/null || true; cp -a /tmp/ToolboxAdminApi-oneclick/app.py "$APP/app.py"; rm -rf "$APP/wwwroot" "$APP/client-template" "$APP/assets" "$APP/deploy"; cp -a /tmp/ToolboxAdminApi-oneclick/wwwroot "$APP/wwwroot"; cp -a /tmp/ToolboxAdminApi-oneclick/client-template "$APP/client-template"; cp -a /tmp/ToolboxAdminApi-oneclick/assets "$APP/assets"; cp -a /tmp/ToolboxAdminApi-oneclick/deploy "$APP/deploy"; rm -rf "$APP/data/client-cache" "$APP/data/client-jobs"; python3 -m py_compile "$APP/app.py"; systemctl restart toolbox-admin; sleep 2; systemctl is-active --quiet toolbox-admin && echo "更新完成，数据已保留。"
```

更新完成后刷新后台页面；如果更新涉及客户端生成逻辑，请重新生成并下载 EXE。

## 数据保留

更新模式会自动识别原部署目录，并保留：

- 后台账号和密码
- 用户、代理和邀请码
- 订单、通知、余额记录
- 系统设置、邮件设置和支付接口配置
- 每个用户的工具箱配置
- `data/` 数据目录

脚本覆盖新程序前会备份现有程序文件到 `/www/backup/`，避免误覆盖客户数据。

## EXE 生成与校验

在线生成工具箱 EXE 需要服务器安装 C# 编译器，例如 `mono-devel`。如果服务器没有 Mono，后台部署和管理功能仍可正常使用，只是不能在线生成 EXE。

Ubuntu / Debian：

```bash
apt install -y mono-devel
systemctl restart toolbox-admin
```

CentOS / Rocky：

```bash
yum install -y mono-devel
systemctl restart toolbox-admin
```

新版 EXE 内置编译签名和文件哈希校验：

- 正版 EXE 可复制到多台电脑运行。
- 文件被修改、密钥不匹配或账号停用会被拦截。
- 更新校验逻辑后，需要在后台重新下载 EXE 再分发。

## 常用维护命令

查看服务状态：

```bash
systemctl status toolbox-admin --no-pager -l
```

重启后台：

```bash
systemctl restart toolbox-admin
```

查看日志：

```bash
journalctl -u toolbox-admin -n 100 --no-pager
```
