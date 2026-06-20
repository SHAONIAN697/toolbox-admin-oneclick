# 工具箱对接说明

## 公开配置接口

工具箱客户端启动时请求：

```http
GET http://你的服务器:5088/api/toolbox/config?key=用户专属key
```

返回值就是完整工具箱配置，结构与原 exe 内嵌配置一致：

```json
{
  "app": {},
  "license": {},
  "sidebar": [],
  "toolbox_tabs": [],
  "pages": {}
}
```

## 推荐客户端逻辑

1. 启动工具箱。
2. 先读取本地内嵌配置，保证离线可用。
3. 请求用户自己的 `/api/toolbox/config?key=...`。
4. 如果请求成功并且 JSON 合法，用远程配置覆盖本地配置。
5. 如果请求失败，继续使用本地内嵌配置。

## 后台直接下载专属工具箱

后台已经提供无需编译的工具箱壳下载：

```http
GET /api/admin/client/download
```

登录后在“对接”页点“下载当前用户工具箱”即可。总管理员在“用户”页也可以给任意用户下载对应工具箱。

下载得到的是 EXE 文件，双击即可启动。EXE 里已经写入该用户的 `/api/toolbox/config?key=...` 地址。

## WebView2 版接法

原工具箱前端已经有类似：

```js
window._onConfigLoaded = function(jsonStr) {
  config = normalizeEditableConfig(JSON.parse(jsonStr));
  finishInit();
};
```

C++ 壳在处理 `get_config` 消息时，可以改成：

```cpp
std::wstring json = TryDownloadText(L"http://你的服务器:5088/api/toolbox/config");
if (json.empty()) {
    json = LoadEmbeddedConfig();
}
webview->ExecuteScript(L"window._onConfigLoaded(" + JsonStringLiteral(json) + L")", nullptr);
```

## 后台管理接口

后台接口需要管理员 token：

```http
Authorization: Bearer <登录后返回的 session token>
```

总管理员可以在后台“用户”页面看到每个用户自己的对接地址。

接口：

```http
GET    /api/admin/config
PUT    /api/admin/config
PATCH  /api/admin/app
GET    /api/admin/buttons
POST   /api/admin/buttons
PATCH  /api/admin/buttons
DELETE /api/admin/buttons
```

## 重要限制

现有 exe 的配置是编译进文件里的。如果不修改或重新打包这个 exe，它不会自动向后台请求配置。

所以可行路径是：

- 做复刻版工具箱，启动时接 `/api/toolbox/config`。
- 或拿到原项目源码，在 C++ 壳里加远程配置拉取后重新打包。
- 或每次用后台导出的 `config.json` 重新生成客户版 exe。

