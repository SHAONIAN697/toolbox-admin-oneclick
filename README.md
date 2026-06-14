# 梳理工具箱后台一键部署版

这是梳理工具箱的后台管理与客户工具箱生成项目。项目提供网页后台、用户管理、邀请码、按钮配置、工具箱配置接口，以及宝塔 Linux 环境的一键部署安装包。

客户只需要在宝塔终端执行一条命令，按提示填写域名、安装目录、端口和后台密码，即可完成部署。

## 主要功能

- 网页后台管理工具箱标题、版本、主题、图标和启动密码。
- 管理工具箱页面、分组、按钮、下载链接和命令按钮。
- 支持多用户，每个用户拥有独立配置和独立工具箱下载地址。
- 支持邀请码注册用户。
- 后台可直接下载当前用户专属工具箱 EXE。
- 客户端下载按钮会先检查本地是否已有同名或同链接文件，已有文件会直接运行或定位，不重复下载，也不弹下载记录。
- 提供 `/api/toolbox/config?key=用户专属key` 配置接口。
- 自动安装 systemd 服务，支持开机自启和异常重启。
- 自动写入宝塔 Nginx 反向代理配置。

## 运行环境

服务器建议使用：

- 宝塔 Linux 面板
- 已添加好网站
- 域名已解析到服务器
- 服务器可以访问 GitHub raw 下载地址

脚本会自动安装：

- python3
- mono-devel

`mono-devel` 只用于后台在线生成和下载工具箱 EXE。即使 Mono 安装失败，后台仍会继续部署。

## 新客户一键部署命令

新客户在宝塔终端复制执行整段命令：

```bash
cd /tmp && rm -rf toolbox-admin-oneclick-install toolbox-admin-oneclick.tar.gz && mkdir -p toolbox-admin-oneclick-install && curl -L --retry 5 --retry-delay 3 -o toolbox-admin-oneclick.tar.gz "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/toolbox-admin-baota-oneclick.tar.gz" && tar -xzf toolbox-admin-oneclick.tar.gz -C toolbox-admin-oneclick-install --strip-components=1 && cd toolbox-admin-oneclick-install && bash install-baota.sh
```

执行后按提示填写：

- 绑定域名：填写客户自己的域名，例如 `gjx.vst76.cn`
- 安装目录：一般直接回车，默认是 `/www/wwwroot/你的域名`
- 本机服务端口：一般直接回车，默认是 `5088`
- 后台管理员密码：可手动输入，也可直接回车自动生成

部署完成后终端会显示后台地址、管理员账号和管理员密码。

默认管理员账号：

```text
admin
```

## 已部署客户保数据更新命令

已部署客户也执行下面这条命令：

```bash
cd /tmp && rm -rf toolbox-admin-oneclick-install toolbox-admin-oneclick.tar.gz && mkdir -p toolbox-admin-oneclick-install && curl -L --retry 5 --retry-delay 3 -o toolbox-admin-oneclick.tar.gz "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/toolbox-admin-baota-oneclick.tar.gz" && tar -xzf toolbox-admin-oneclick.tar.gz -C toolbox-admin-oneclick-install --strip-components=1 && cd toolbox-admin-oneclick-install && bash install-baota.sh
```

更新命令使用 `/tmp` 临时目录解压，不会删除 `/www/wwwroot` 里的客户安装目录。

更新时脚本会自动检测已有 `toolbox-admin` 服务：

- 默认使用原来的安装目录
- 默认使用原来的服务端口
- 保留原后台账号和密码
- 保留 `data/users.json`
- 保留 `data/users/<用户ID>/config.json`
- 保留用户列表、邀请码、后台配置和每个用户的工具箱配置

如果脚本提示检测到已部署目录，直接按回车使用默认值即可。

## 数据保护说明

客户数据都保存在安装目录下的 `data` 目录：

```text
data/users.json
data/users/<用户ID>/config.json
data/mail.json
data/sessions.json
```

更新时脚本不会覆盖已有 `data` 目录，并且会自动生成备份：

```text
data.bak.年月日时分秒
```

如果之前错误更新导致数据丢失，可以先查看安装目录里是否存在 `data.bak.*` 备份目录，再手动恢复。

## 后台使用流程

1. 浏览器打开客户域名，进入后台登录页。
2. 使用账号 `admin` 和安装完成时显示的密码登录。
3. 进入“总览”，设置工具箱标题、版本、主题和图标。
4. 进入“按钮”，新增页面、分组和按钮。
5. 进入“用户”，创建用户或生成邀请码。
6. 进入“对接”，下载当前用户专属工具箱 EXE。
7. 将下载出来的 EXE 发给对应客户使用。

## 客户端下载逻辑

客户在工具箱里点击“下载文件”按钮时：

- 如果同一个文件正在下载中，不会重复创建下载任务，也不会弹出下载记录。
- 如果下载目录里已经有同名文件，会直接运行或定位已有文件，不会弹出下载记录。
- 如果下载记录里有同链接或同名文件，并且文件仍存在，也会直接运行或定位已有文件，不会新增“文件已存在”记录。
- 只有本地没有这个文件时，才会重新下载。

## 常用维护命令

查看服务状态：

```bash
systemctl status toolbox-admin --no-pager -l
```

重启服务：

```bash
systemctl restart toolbox-admin
```

查看服务日志：

```bash
journalctl -u toolbox-admin -n 100 --no-pager
```

测试本机服务：

```bash
curl http://127.0.0.1:5088/
```

## 对接接口

工具箱配置接口：

```http
GET /api/toolbox/config?key=用户专属key
```

后台登录后可在“用户”或“对接”页面查看对应用户的专属配置地址。

## 仓库文件

- `toolbox-admin-baota-oneclick.tar.gz`：客户一键部署安装包。
- `ToolboxClient.cs`：工具箱客户端源码备份。
- `README.md`：项目介绍、部署方法和更新方法。

安装包内不包含教程文件，客户执行一键命令后只会解压运行所需程序文件。
