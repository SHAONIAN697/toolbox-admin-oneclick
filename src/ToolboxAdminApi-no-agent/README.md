# 工具箱后台一键部署版

这是一个用于管理 Windows 工具箱客户端的网页后台。后台可以配置工具箱标题、主题、按钮、下载项、系统工具、用户账号、邀请码、通知、隐藏入口弹窗，并为不同用户生成专属 EXE 客户端。

## 最新功能

- 多用户管理：总管理员可管理用户、邀请码和每个用户的工具箱配置。
- 邀请码注册：支持批量生成邀请码、设置可用次数和使用后保留天数。
- 支付接口配置：系统设置中支持多套支付接口配置。
- 通知中心：支持未读状态、登录弹窗、单条删除、全部删除、邮件推送指定通知。
- 自定义页面和按钮：支持页面位置、按钮分组、下载记录、系统工具和自定义脚本。
- 隐藏入口弹窗：连续点击客户端左上角 Logo 可打开“联系我们 / 支持作者”弹窗，内容由后台配置。
- 主题自适配：后台通知框、隐藏入口弹窗和客户端界面跟随当前主题，浅色深色自动适配。
- 编译校验：后台生成的 EXE 会校验编译签名和文件哈希，防止篡改。
- 多电脑运行：同一个正版 EXE 可发给多台电脑运行，不绑定下载电脑；旧版 EXE 需要重新下载。
- 手机端适配：后台表单、通知、邀请码和复制操作已优化移动端显示。

## 一键部署 / 更新

新部署和已有服务器更新使用同一条命令。更新时会保留服务器上的账号、密码、用户、配置、通知和 `data/` 数据目录。

```bash
cd /www/wwwroot && rm -rf toolbox-admin-oneclick toolbox-admin-oneclick.tar.gz toolbox-admin-oneclick.tar.gz.b64 && mkdir -p toolbox-admin-oneclick && curl -L --retry 5 --retry-delay 3 -o toolbox-admin-oneclick.tar.gz.b64 "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/toolbox-admin-baota-oneclick.tar.gz.b64" && if command -v base64 >/dev/null 2>&1; then base64 -d toolbox-admin-oneclick.tar.gz.b64 > toolbox-admin-oneclick.tar.gz; else python3 -c "import base64,pathlib; pathlib.Path('toolbox-admin-oneclick.tar.gz').write_bytes(base64.b64decode(pathlib.Path('toolbox-admin-oneclick.tar.gz.b64').read_text()))"; fi && ls -lh toolbox-admin-oneclick.tar.gz && tar -xzf toolbox-admin-oneclick.tar.gz -C toolbox-admin-oneclick --strip-components=1 && cd toolbox-admin-oneclick && bash install-baota.sh
```

执行后按提示填写：

- 绑定域名：填写客户自己的域名。
- 安装目录：首次部署可直接回车，更新时脚本会优先使用原安装目录。
- 服务端口：默认 `5088`，已有部署会沿用原端口。
- 管理员密码：首次部署可填写或回车自动生成，更新时保持原密码。

## 数据保留

更新模式会自动识别原部署目录，并保留：

- 后台账号和密码
- 用户和邀请码
- 通知记录
- 系统设置、邮件设置和支付接口配置
- 每个用户的工具箱配置
- `data/` 数据目录

脚本复制新程序前会备份已有 `data/` 目录，避免覆盖客户数据。

## EXE 生成与校验

在线生成工具箱 EXE 需要服务器安装 C# 编译器，例如 `mono-devel`。如果服务器没有 Mono，后台部署和管理功能仍可正常使用，只是不能在线生成 EXE。

```bash
apt install -y mono-devel
systemctl restart toolbox-admin
```

CentOS / Rocky 可使用：

```bash
yum install -y mono-devel
systemctl restart toolbox-admin
```

新版本 EXE 内置编译签名和文件哈希校验：

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
