# 梳理工具箱后台一键部署版

这是梳理工具箱的后台管理与客户工具箱生成项目。项目提供网页后台、用户管理、按钮配置、工具箱配置接口，以及宝塔 Linux 环境的一键部署安装包。

客户只需要在宝塔终端执行一条命令，按提示填写域名、安装目录、端口和后台密码，即可完成部署。

## 主要功能

- 网页后台管理工具箱标题、版本、主题、图标等基础信息。
- 管理工具箱页面、分组、按钮和启动命令。
- 支持多用户，每个用户拥有独立配置和独立工具箱下载地址。
- 支持邀请码创建用户。
- 后台可直接下载当前用户专属工具箱 EXE。
- 支持工具箱启动密码。
- 提供公开配置接口，方便客户端按用户拉取配置。
- 宝塔 Nginx 反向代理自动配置。
- systemd 服务自动安装、开机自启和异常重启。

## 运行环境

服务器建议使用：

- 宝塔 Linux 面板
- 已添加好网站
- 域名已解析到服务器
- 服务器可以访问 GitHub raw 下载地址

脚本会自动安装：

- python3
- mono-devel

其中 `mono-devel` 只用于后台在线生成和下载工具箱 EXE。如果客户服务器软件源异常导致 Mono 安装失败，后台仍会继续部署；修复系统软件源后再安装 Mono 即可。

## 新客户一键部署命令

在宝塔终端复制执行整段命令：

```bash
cd /www/wwwroot && rm -rf toolbox-admin-oneclick toolbox-admin-oneclick.tar.gz && mkdir -p toolbox-admin-oneclick && curl -L --retry 5 --retry-delay 3 -o toolbox-admin-oneclick.tar.gz "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/toolbox-admin-baota-oneclick.tar.gz" && ls -lh toolbox-admin-oneclick.tar.gz && tar -xzf toolbox-admin-oneclick.tar.gz -C toolbox-admin-oneclick --strip-components=1 && cd toolbox-admin-oneclick && bash install-baota.sh
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

## 已部署客户一键更新命令

已部署客户也执行同一条命令：

```bash
cd /www/wwwroot && rm -rf toolbox-admin-oneclick toolbox-admin-oneclick.tar.gz && mkdir -p toolbox-admin-oneclick && curl -L --retry 5 --retry-delay 3 -o toolbox-admin-oneclick.tar.gz "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/toolbox-admin-baota-oneclick.tar.gz" && ls -lh toolbox-admin-oneclick.tar.gz && tar -xzf toolbox-admin-oneclick.tar.gz -C toolbox-admin-oneclick --strip-components=1 && cd toolbox-admin-oneclick && bash install-baota.sh
```

更新时填写原来的域名和原来的安装目录。安装脚本检测到原有 `data` 数据目录后会自动备份并保留客户数据。

## 后台使用流程

1. 浏览器打开客户域名，进入后台登录页。
2. 使用账号 `admin` 和安装完成时显示的密码登录。
3. 进入“总览”，设置工具箱标题、版本、主题和图标。
4. 进入“按钮”，新增页面、分组和按钮。
5. 进入“用户”，创建用户或生成邀请码。
6. 进入“对接”，下载当前用户专属工具箱 EXE。
7. 将下载出来的 EXE 发给对应客户使用。

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

如果客户服务器出现 dpkg 或 Mono 依赖问题，可先执行：

```bash
dpkg --configure -a && apt --fix-broken install -y
```

然后重新执行一键部署命令。

## 数据目录

客户数据保存在安装目录下的 `data` 目录：

```text
data/users.json
data/users/<用户ID>/config.json
```

重新部署或更新时，脚本会优先保留原有 `data` 目录，并自动生成备份目录。

## 对接接口

工具箱配置接口：

```http
GET /api/toolbox/config?key=用户专属key
```

后台登录后可在“用户”或“对接”页面查看对应用户的专属配置地址。

## 文件说明

- `toolbox-admin-baota-oneclick.tar.gz`：客户一键部署安装包。
- `ToolboxClient.cs`：工具箱客户端源码备份。
- `README.md`：项目说明和部署方法。

安装包内不包含教程文件，客户执行一键命令后只会解压运行所需程序文件。
