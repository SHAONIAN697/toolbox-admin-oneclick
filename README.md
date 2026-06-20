# 工具箱三个客户端版本本地测试更新分支

本分支用于保存 2026-06-19 至 2026-06-20 本地测试后已经同步到宝塔服务器的三个客户端版本更新。它是从 `main` 新建的独立分支，不覆盖旧版本主分支。

## 本分支更新的是哪三个客户端

这次不是只更新后台说明，也不是只保留生成逻辑；本分支已经同步更新后台生成的三个 EXE 客户端版本：

- 默认版：`original`，后台按钮显示为“下载工具箱”。
- 工作台版：`studio`，后台三版本下载区里的工作台布局版本。
- 门户版：`portal`，后台三版本下载区里的门户布局版本。

三个版本共用同一份客户端模板 `client-template/ToolboxClient.cs`，由后台 `CLIENT_VARIANTS` 按 `original / studio / portal` 分别生成。服务器更新完成后会清理旧 EXE 缓存，必须回到后台重新下载这三个客户端 EXE，旧 EXE 不会自动变。

## 分支内容

- `src/ToolboxAdminApi`：当前宝塔站点使用的完整后台源码。
- `src/ToolboxAdminApi-oneclick`：一键部署版源码。
- `src/ToolboxAdminApi-baota-source`：宝塔源码版。
- `packages/`：本地测试后生成的更新包和热修复包。
- `docs/`：服务器直接替换更新命令、全量更新命令和配置同步说明。

仓库中不包含服务器运行数据目录 `data/`、客户端编译缓存、任务 EXE、会话、日志和本地账号配置，避免覆盖已部署服务器数据。

## 本次更新重点

- 已统一同步三个客户端版本：默认版、工作台版、门户版。
- 总管理后台切换其他账号时，目标账号不再通过 `X-Target-User` 请求头传递，修复中文或特殊字符账号导致浏览器 `fetch` 拒绝请求的问题。
- 客户端支持识别 `links.8uid.com/d/...` 这类中转直链，能解析真实文件名和下载入口；遇到验证码时自动打开浏览器处理。
- 修复客户端旧 .NET 环境下 `Trim(Char)` 方法不兼容导致的弹窗错误。
- 修复客户端标题显示中多余的 `/`。
- 修复工具箱配置公开读取接口，客户端可按 key 正常拉取配置。
- 支持后台导出配置文件、导入配置文件、生成云端配置链接并从链接导入。
- 更新后后台需要重新生成并下载三个客户端 EXE：默认版、工作台版、门户版。

## 已部署服务器更新方式

已部署过的宝塔服务器不要重新跑首次安装命令。使用 `docs/gjx服务器直接替换更新命令.txt` 中的命令，它会：

- 备份当前 `app.py`、`wwwroot`、`client-template`、`assets`、`deploy` 到 `/www/backup/`。
- 覆盖程序文件和前端文件。
- 保留服务器上的 `data/`，包括账号、密码、用户配置、通知、订单、邀请码、系统设置和云端配置链接。
- 清理 `data/client-cache` 和 `data/client-jobs`，避免旧的三个客户端 EXE 缓存继续生效。
- 重启 `toolbox-admin` 服务。

更新完成后需要在浏览器中按 `Ctrl+F5` 强制刷新后台页面，然后在后台三版本下载区重新下载并分发三个客户端 EXE。

## 目录说明

```text
src/
  ToolboxAdminApi/              当前部署源码
  ToolboxAdminApi-oneclick/     一键部署版源码
  ToolboxAdminApi-baota-source/ 宝塔源码版
packages/
  toolbox-gjx-target-user-header-hotfix-preserve-data.tar.gz
  toolbox-gjx-8uid-download-compat-hotfix-preserve-data.tar.gz
  toolbox-gjx-title-slash-hotfix-preserve-data.tar.gz
  toolbox-gjx-config-hotfix-preserve-data.tar.gz
  toolbox-full-local-tested-preserve-data.tar.gz
docs/
  gjx服务器直接替换更新命令.txt
  服务器免上传-全量本地测试更新命令.txt
  服务器直接执行-全量本地测试更新命令.txt
```

## 注意

GitHub 的私密性是仓库级别，不是分支级别。如果需要私密，请将整个仓库设置为 Private；本分支不会影响 `main` 旧版本。
