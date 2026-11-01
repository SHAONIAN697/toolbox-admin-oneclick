# 工具箱后台一键版

<p align="center">
  <strong>Windows 工具箱客户端的网页管理后台与一键部署项目</strong><br>
  集中管理内容、用户与版本配置，按用户生成专属客户端；更新服务端时保留现有业务数据。
</p>

<p align="center">
  <a href="https://github.com/SHAONIAN697/toolbox-admin-oneclick"><img alt="GitHub 仓库" src="https://img.shields.io/badge/GitHub-SHAONIAN697%2Ftoolbox--admin--oneclick-181717?logo=github"></a>
  <a href="docs/更新日志.md"><img alt="更新日志" src="https://img.shields.io/badge/文档-更新日志-2f855a"></a>
  <a href="COPYRIGHT.md"><img alt="项目来源" src="https://img.shields.io/badge/项目说明-来源与版权-3978c5"></a>
</p>

适用于软件资源分发、装机维护、音频工作站工具包、企业内部工具集合及客户专属工具平台。客户端内容由服务端配置驱动，日常调整页面、按钮和资源无需重新开发客户端界面。

## 快速部署

以下命令适用于首次部署和已部署实例更新。主链接命令先尝试 GitHub Raw，连接失败或超时后会自动依次切换到 3 个备用线路；也可以单独复制任意备用链接命令。每个代码框右上角都有独立的复制按钮。

| 顺序 | 链接 |
| --- | --- |
| 主链接 | [GitHub Raw](https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/script/toolbox-admin.sh) |
| 备用链接 1 | [ghfast.top](https://ghfast.top/https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/script/toolbox-admin.sh) |
| 备用链接 2 | [gh-proxy.org](https://gh-proxy.org/https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/script/toolbox-admin.sh) |
| 备用链接 3 | [jsDelivr CDN](https://cdn.jsdelivr.net/gh/SHAONIAN697/toolbox-admin-oneclick@main/script/toolbox-admin.sh) |

**主链接命令（自动故障切换）**

```bash
TMP_SCRIPT="/tmp/toolbox-admin.sh.$$"; DOWNLOADED=0; for URL in "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/script/toolbox-admin.sh" "https://ghfast.top/https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/script/toolbox-admin.sh" "https://gh-proxy.org/https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/script/toolbox-admin.sh" "https://cdn.jsdelivr.net/gh/SHAONIAN697/toolbox-admin-oneclick@main/script/toolbox-admin.sh"; do echo "尝试下载：$URL"; if curl -fsSL --retry 0 --connect-timeout 8 --max-time 45 "$URL" -o "$TMP_SCRIPT" && test -s "$TMP_SCRIPT"; then DOWNLOADED=1; break; fi; done; if [ "$DOWNLOADED" = 1 ]; then if sudo install -m 755 "$TMP_SCRIPT" /tmp/toolbox-admin.sh; then rm -f "$TMP_SCRIPT"; sudo bash /tmp/toolbox-admin.sh; else rm -f "$TMP_SCRIPT"; echo "安装管理脚本失败，请检查 sudo 权限和磁盘空间。" >&2; exit 1; fi; else rm -f "$TMP_SCRIPT"; echo "主线路和备用线路均下载失败，请检查服务器网络后重试。" >&2; exit 1; fi
```

**备用链接 1：ghfast.top**

```bash
TMP_SCRIPT="/tmp/toolbox-admin.sh.$$"; if curl -fsSL --retry 0 --connect-timeout 10 --max-time 60 "https://ghfast.top/https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/script/toolbox-admin.sh" -o "$TMP_SCRIPT" && test -s "$TMP_SCRIPT"; then sudo install -m 755 "$TMP_SCRIPT" /tmp/toolbox-admin.sh && rm -f "$TMP_SCRIPT" && sudo bash /tmp/toolbox-admin.sh; else rm -f "$TMP_SCRIPT"; echo "下载失败，请尝试其他备用链接。" >&2; exit 1; fi
```

**备用链接 2：gh-proxy.org**

```bash
TMP_SCRIPT="/tmp/toolbox-admin.sh.$$"; if curl -fsSL --retry 0 --connect-timeout 10 --max-time 60 "https://gh-proxy.org/https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/script/toolbox-admin.sh" -o "$TMP_SCRIPT" && test -s "$TMP_SCRIPT"; then sudo install -m 755 "$TMP_SCRIPT" /tmp/toolbox-admin.sh && rm -f "$TMP_SCRIPT" && sudo bash /tmp/toolbox-admin.sh; else rm -f "$TMP_SCRIPT"; echo "下载失败，请尝试其他备用链接。" >&2; exit 1; fi
```

**备用链接 3：jsDelivr CDN**

```bash
TMP_SCRIPT="/tmp/toolbox-admin.sh.$$"; if curl -fsSL --retry 0 --connect-timeout 10 --max-time 60 "https://cdn.jsdelivr.net/gh/SHAONIAN697/toolbox-admin-oneclick@main/script/toolbox-admin.sh" -o "$TMP_SCRIPT" && test -s "$TMP_SCRIPT"; then sudo install -m 755 "$TMP_SCRIPT" /tmp/toolbox-admin.sh && rm -f "$TMP_SCRIPT" && sudo bash /tmp/toolbox-admin.sh; else rm -f "$TMP_SCRIPT"; echo "下载失败，请尝试其他备用链接。" >&2; exit 1; fi
```

下载并运行后，可在服务器任意目录输入 `toolbox-admin` 再次打开管理脚本。

## 项目能力

- 六种客户端模板：原版工具箱、调音师经典版、调音师工具箱简约版、音频工具箱火山版、导航首页版和调音师工具箱旗舰版。
- 可视化后台：管理用户、邀请码、页面、分组、按钮、主题、通知、登录设置和客户端版本更新。
- 软件资源中心：支持软件搜索、图标、分类、在线目录、本地推荐和 Winget 回退。
- 下载管理：支持单文件下载、多文件安装包、备用地址、备用网页、断点续传、暂停恢复、队列、并发和下载记录。
- 网盘资源解析：支持个人资源管理、目录文件识别、服务端代理下载和 Range 分段传输；解析密钥仅保存在服务端。
- 客户端安全校验：生成的 EXE 带有账号、版本、构建签名和文件哈希校验，可检测文件修改、密钥不匹配和账号停用。
- 响应式后台：支持桌面和手机端使用，后台通知、邀请码、配置表单和复制操作适配窄屏。

后台和仓库说明中的项目来源署名为 **少年科技工作室**。该署名不写入生成的客户端或后台桌面 EXE，也不作为防止代码修改的技术措施。

> 品牌与维护者：**少年科技工作室**。项目来源与版权说明见 [COPYRIGHT.md](COPYRIGHT.md)。

## 2026-10-31 星轨工具箱首页按钮配置

- “按钮”页面新增星轨工具箱首页专属页签，分别配置左侧与右侧按钮；图标、动作和排列沿用当前用户自己的后台设置。
- 客户端首页按可用高度排列图标按钮，不显示横向或纵向滚动条；旧用户配置会自动补齐默认页面结构。
- 声卡驱动页停止尺寸事件重绘循环；下载中心隐藏滚动条并保留滚轮浏览，工具箱界面统一圆角、按钮状态动效和横幅悬停缩放。
- 星轨版本封面使用随部署包发布的静态图片；旧服务器仅在封面缺省时补齐，不覆盖已有配置。
- 最新一键部署包排除服务器运行数据、缓存和日志；SHA256：`707cdcf8019df7a085250565c569dcc354c3ab3c818261ab1e86cfd34fb8be0a`。

## 2026-10-29 品牌署名范围调整

- “少年科技工作室”署名仅用于管理后台网页、仓库说明和源码来源声明；生成的客户端及后台桌面 EXE 不写入工作室公司名或版权信息，也不显示工作室署名。
- EXE 属性中的公司名和版权字段仍可选填，但工作室署名会被过滤，避免进入新生成的文件。
- 核心源码文件增加来源注记。该标识用于记录来源，不代表专利登记或不可修改保护。
- 当日发布包已包含源码版权说明和更新后的源码介绍，并排除服务器运行数据、缓存和日志。

## 2026-10-25 直链分片下载探测修复

- CDN 直链的 Range 探测统一允许最多等待 12 秒，修复部分 CDN 首次响应较慢时被误判为下载失败的问题。
- 保持分片下载流程不变，并为该行为补充回归测试。

## 2026-09-07 部署账号修复

- 首次部署可填写真实后台管理员账号（例如手机号），并将该账号写入超级管理员数据。
- 更新部署从现有 `data/users.json` 读取并显示实际启用的超级管理员账号，不再固定显示 `admin`，也不会覆盖已有密码。
- 管理脚本的“修改管理员密码”按真实超级管理员账号处理；多管理员时先选择目标，修改后撤销该账号的旧登录会话。
- 已有密码以摘要保存，更新完成提示不会把安装环境变量误报为当前后台密码。

## 2026-10-22 网盘解析设置部署修复

- 修复正式部署包遗漏 `cloud_resolver.py`，导致解析模块设置保存时报“接口不存在”。
- 安装和更新会同步此模块；更新命令仍保留服务器现有 `data/` 数据。
- 模块缺失或加载失败时，相关接口会给出明确错误，服务启动日志会记录加载原因。
- 同日修复多文件下载客户端模板的编译问题，并通过 Mono 编译验证。

## 2026-09-06 更新

- 新增“调音师工具箱旗舰版”，共用现有后台配置、下载容器、队列、断点续传和并发下载能力。
- 软件大全接入在线软件目录、真实软件图标和下载解析，并保留本地与 Winget 回退。
- 修复原版、经典版、简约版、火山版、导航版的软件大全没有纵向滚动条、无法查看后续软件的问题。
- 调音师简约版和旗舰版的左侧菜单严格按后台配置的页面、名称与顺序显示，不再自动混入固定页面。
- 旗舰版配置了系统概览时会将其置于左侧菜单首位并默认打开；概览内容随窗口高度压缩排布，完整显示且不出现纵向滚动条。
- 旗舰版“按钮图文排列”改为按页面生效：未选中的页面全部保持普通按钮，选中的页面全部使用软件大全风格卡片，包括未单独配置图标的按钮；按钮动作、密码确认和现有下载进度体系保持不变。
- 后台配置的软件按钮图片改为完整异步加载：同一图片可同时更新多个按钮，首次渲染期间页面重建也会自动补图，临时网络失败会有限重试，无需切换页面刷新。
- 品牌头像继续按后台图片 URL 直接拉取，并在临时失败后重试；火山版软件大全适配原版浅色 UI，显示联想应用商店图片、评分、下载量、说明和动态 GIF 图标。
- 配置同步改用 ETag 轻量刷新和失败退避，移除阻塞式长轮询，减少连接后台缓慢及短暂网络波动误报断连的问题。
- 恢复按钮独立下载目录、按钮退出删除、暂停任务字段持久化和不可写目录自动回退，避免新版覆盖旧版稳定功能。
- 六种客户端模板已统一更新；更新服务端后需在后台重新生成并下载各版本 EXE。
- 修复经典版和旗舰版首次打开时偶发内容空白；配置应用完成后会在窗口布局恢复后自动重绘当前页面。旗舰版即使后台侧栏未单独列出系统概览，只要页面配置存在仍会将其放在左侧第一项。

## 2026-08-31 更新

- 下载按钮支持主下载地址、备用下载地址和备用网页地址。主地址无法访问时，客户端会自动切换到备用地址；备用地址仍失败时会打开备用网页。
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
- 仓库仅保留一份正式源码：`src/ToolboxAdminApi-oneclick`
- 最新一键包：`packages/toolbox-admin-local-latest.tar.gz`
- 最新一键包 Base64：`packages/toolbox-admin-local-latest.tar.gz.b64`
- SHA256 清单：`packages/toolbox-admin-local-latest.tar.gz.sha256`
- 更新日志：`docs/更新日志.md`
- 首次部署命令：`docs/首次部署命令.txt`
- 已部署服务器保留数据更新命令：`docs/已部署服务器保留数据更新命令.txt`

## 运行要求

- 服务端：Linux、Python 3 和 systemd；一键部署脚本会安装或检查所需运行环境。
- EXE 生成：服务器需要安装 `mono-devel` 或其他可用的 C# 编译器；没有编译器时后台仍可正常运行。
- 数据目录：服务器账号、用户配置、通知、系统设置、解析配置和客户端构建记录保存在 `data/`，更新时默认保留。
- 资源安全：不要把真实 API Key、Cookie、Token 或服务器运行数据提交到仓库；网盘解析密钥应在后台配置。

## 多文件安装包配置

1. 进入后台“按钮”页面，新增按钮或编辑已有按钮。
2. 将动作设置为“下载文件”。
3. 在下载配置中选择“多文件安装包”。
4. 填写安装包文件夹名称，并逐条添加文件下载地址。
5. 可为每个文件填写备用下载地址和备用网页地址。
6. 将需要在全部下载完成后启动的 `.exe` 标记为“完成后运行”。
7. 保存配置后，重新生成并下载客户工具箱 EXE 进行测试。

客户端会把同一按钮下的全部文件保存到 `Toolbox/<安装包文件夹名称>/`。文件名由客户端自动识别，后台不需要重复填写。

## 管理脚本说明

重新下载或首次运行管理脚本，请使用上方“快速部署”中的命令。脚本启动后会显示交互菜单；选择安装或更新时，可按提示指定 GitHub 代理地址，也可直接回车使用自动下载线路。

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
