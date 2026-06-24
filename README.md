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

已经部署过的服务器不要重新跑首次部署命令。使用下面这份命令文件更新，它只覆盖程序文件，保留服务器原来的 `data/`。

```text
docs/GitHub无代理版-已部署服务器保留数据更新命令.txt
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
