# 梳理工具箱后台一键部署版

梳理工具箱后台是一套用于管理 Windows 工具箱客户端的网页后台。后台可以配置工具箱标题、主题、按钮、下载项、系统工具、用户账号、邀请码和客户端更新入口，并为不同用户生成独立的工具箱配置与专属 EXE。

## 主要功能

- 网页后台管理：浏览器登录后即可维护工具箱配置。
- 多用户管理：管理员可以创建用户、停用用户、重置对接地址、控制 JSON 查看权限。
- 邀请码注册：支持生成邀请码、设置可用次数、查看使用记录。
- 独立用户配置：每个用户拥有独立配置和专属对接地址。
- 工具箱 EXE 下载：后台可为当前用户或指定用户生成专属客户端。
- 下载按钮优化：客户端会先判断本地是否已有目标文件，存在则直接运行或定位，不重复下载、不弹下载记录。
- 移动端后台优化：新增用户、用户列表、邀请码卡片默认收缩，可单独展开，手机端更方便管理。
- 宝塔一键部署：适配宝塔 Linux 面板，自动配置 systemd 服务和 Nginx 反向代理。

## 一键部署 / 一键更新命令

新客户第一次部署、老客户后续更新，使用同一条命令。更新时会保留原服务器的后台账号密码、配置、用户列表、邀请码和 `data/` 数据目录。

```bash
cd /www/wwwroot && rm -rf toolbox-admin-oneclick toolbox-admin-oneclick.tar.gz toolbox-admin-oneclick.tar.gz.b64 && mkdir -p toolbox-admin-oneclick && curl -L --retry 5 --retry-delay 3 -o toolbox-admin-oneclick.tar.gz.b64 "https://raw.githubusercontent.com/SHAONIAN697/toolbox-admin-oneclick/main/toolbox-admin-baota-oneclick.tar.gz.b64" && if command -v base64 >/dev/null 2>&1; then base64 -d toolbox-admin-oneclick.tar.gz.b64 > toolbox-admin-oneclick.tar.gz; else python3 -c "import base64,pathlib; pathlib.Path('toolbox-admin-oneclick.tar.gz').write_bytes(base64.b64decode(pathlib.Path('toolbox-admin-oneclick.tar.gz.b64').read_text()))"; fi && ls -lh toolbox-admin-oneclick.tar.gz && tar -xzf toolbox-admin-oneclick.tar.gz -C toolbox-admin-oneclick --strip-components=1 && cd toolbox-admin-oneclick && bash install-baota.sh
```

执行后按提示填写：

- 绑定域名：填写客户自己的域名。
- 安装目录：第一次部署一般直接回车；更新时脚本会优先使用原安装目录。
- 服务端口：默认 `5088`，已有部署会自动沿用原端口。
- 管理员密码：第一次部署可填写或回车自动生成；更新时保持原密码。

## 数据保留规则

更新模式会自动识别原部署目录，并保留：

- 后台账号和密码
- 用户列表
- 邀请码
- 后台配置
- 每个用户的工具箱配置
- `data/` 数据目录

脚本复制新程序前会备份已有 `data/` 目录，避免覆盖客户数据。

## EXE 生成说明

后台在线生成工具箱 EXE 需要服务器安装 C# 编译器，例如 `mono-devel`。一键部署不会强制修复 dpkg，也不会自动执行系统包修复命令。即使服务器没有 Mono，后台部署和管理功能仍可正常使用，只是不能在线生成 EXE。

如需在线生成 EXE，请确认服务器软件源正常后手动安装：

```bash
apt install -y mono-devel
systemctl restart toolbox-admin
```

CentOS / Rocky 可使用：

```bash
yum install -y mono-devel
systemctl restart toolbox-admin
```

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
