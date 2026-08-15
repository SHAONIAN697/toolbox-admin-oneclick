# 工具箱后台一键版

这是一个面向 Windows 工具箱客户端的网页管理后台。管理员可以集中配置品牌、页面、分组、功能按钮、单文件与多文件安装包、系统工具、用户账号、邀请码和通知，并为不同用户在线生成专属 EXE 客户端。

项目适合软件资源分发、装机工具箱、音频工作站工具包和客户专属工具集合等场景。后台配置完成后，客户端会自动同步最新内容，无需为每次内容调整重新开发界面。

## 2026-07-26 更新

- 下载按钮新增“单文件”和“多文件安装包”两种模式。
- 多文件安装包支持通过“添加文件”配置多个直链，并选择下载完成后运行的主程序。
- 同一安装包的 `.exe`、`.pak` 等文件会下载到同一个独立目录。
- 客户端自动从 URL、重定向响应和 `Content-Disposition` 识别真实文件名，无需后台手动填写文件名。
- 新增 `.pak` 直链识别，修复多个相似文件被错误合并为一个 `download.bin` 的问题。
- 同批次下载任务使用独立路径占用检查，重名时自动生成唯一名称。
- 只有整组文件全部成功后才运行选定的主程序；失败文件可单独重试，已完成文件会保留。
- 后台新增和编辑界面改为完整响应式布局，支持多文件地址的添加、删除和主程序选择。
- 现有 `download_url` 单文件配置保持兼容，不需要迁移历史数据。

> 更新服务端程序后，需要在后台重新生成并下载工具箱 EXE。旧 EXE 不包含新的多文件下载逻辑。

## 源码与发布包

- 最新源码：`main` 分支的 `src/ToolboxAdminApi-oneclick`
- 本次功能提交：`e450135` 及后续 README 更新
- 下列 2026-06-29 压缩包为历史稳定发布包，不包含 2026-07-26 多文件下载更新。

- 一键包：`packages/toolbox-admin-baota-oneclick-20260629-portal-english-login-fix.tar.gz`
- 一键包 Base64：`packages/toolbox-admin-baota-oneclick-20260629-portal-english-login-fix.tar.gz.b64`
- 源码目录：`src/ToolboxAdminApi-oneclick`
- SHA256 清单：`docs/更新包SHA256清单.txt`
- 首次部署命令：`docs/首次部署命令.txt`
- 已部署服务器保留数据更新命令：`docs/已部署服务器保留数据更新命令.txt`

## 更新重点

- 多用户管理：总管理员可管理用户、邀请码和每个用户的工具箱配置。
- 邀请码注册：支持批量生成邀请码、设置可用次数和使用后保留天数。
- 通知中心：支持未读状态、登录弹窗、单条删除、全部删除、邮件推送指定通知。
- 自定义页面和按钮：支持页面位置、按钮分组、下载记录、系统工具和自定义脚本。
- 安装包分发：支持单文件下载，以及 `.exe + .pak` 等必须位于同一目录的多文件组合下载。
- 下载任务管理：支持队列、并发下载、断点续传、暂停恢复、失败保留和下载记录。
- 隐藏入口弹窗：连续点击客户端左上角 Logo 可打开弹窗，内容由后台配置。
- 主题自适配：后台通知框、隐藏入口弹窗和客户端界面跟随当前主题，浅色深色自动适配。
- 编译校验：后台生成的 EXE 会校验编译签名和文件哈希，防止篡改。
- 多电脑运行：同一个正版 EXE 可发给多台电脑运行，不绑定下载电脑；旧版 EXE 需要重新下载。
- 手机端适配：后台表单、通知、邀请码和复制操作已优化移动端显示。

## 多文件安装包配置

1. 进入后台“按钮”页面，新增按钮或编辑已有按钮。
2. 将动作设置为“下载文件”。
3. 在下载配置中选择“多文件安装包”。
4. 填写安装包文件夹名称，并逐条添加文件下载地址。
5. 将需要在全部下载完成后启动的 `.exe` 标记为“完成后运行”。
6. 保存配置后，重新生成并下载客户工具箱 EXE 进行测试。

客户端会把同一按钮下的全部文件保存到 `Toolbox/<安装包文件夹名称>/`。文件名由客户端自动识别，后台不需要重复填写。

## 一键管理脚本

首次下载或重新下载最新版管理脚本，统一使用以下命令：

```bash
(curl -fsSL --connect-timeout 5 --max-time 15 "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/refs/heads/main/script/toolbox-admin.sh" -o /tmp/toolbox-admin.sh || curl -fsSL --retry 3 --connect-timeout 15 --max-time 180 "https://gh-proxy.com/https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/refs/heads/main/script/toolbox-admin.sh" -o /tmp/toolbox-admin.sh) && { sudo chattr -i /usr/local/bin/toolbox-admin 2>/dev/null || true; sudo install -m 755 /tmp/toolbox-admin.sh /usr/local/bin/toolbox-admin && sudo /usr/local/bin/toolbox-admin; }
```

下载完成后，以后在服务器任意目录输入 `toolbox-admin` 即可进入管理脚本。需要重新下载管理脚本时，再执行一次上面的命令即可。

选择安装或更新后，脚本会询问是否使用 GitHub 代理。直接回车不使用代理并继续执行；需要加速时可填写 `https://gh-proxy.com/`。

> 更新服务端程序后，请在后台重新生成并下载工具箱 EXE。

## 数据保留

更新模式会保留：

- 后台账号和密码
- 用户和邀请码
- 通知记录
- 系统设置、邮件设置和支付接口配置
- 每个用户的工具箱配置
- `data/` 数据目录

## 说明

- 更新前会自动备份当前程序文件和 `data/`。
- 更新时只替换程序文件，不会清空原有数据。
- 如果服务器没有安装 `mono-devel`，只能使用已编译好的 EXE 相关功能，无法在线生成 EXE。
