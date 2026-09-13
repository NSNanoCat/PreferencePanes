# PreferencePanes 模块 API 规范

## 职责

业务模块按版本提供 `/configs/{module}` 的 BoxJS JSON，并与业务脚本使用同一个 `X-PreferencePanes-Version`。通用模块页面直接读取该 JSON，并交给浏览器包的 `mount(boxjs)` 渲染。

PreferencePanes 的 `api.js` 只负责模块探测、字段目录校验和 util `Storage` 持久化。它不生成页面 Model，不解释控件类型、选项、默认值或展示元数据，也不返回 HTML、CSS 或浏览器脚本。

PreferencePanes 的 `web.js` 只返回通用模块 HTML、`index.mjs` 和 `navigation.mjs`。它不接管 `/api/**` 或 `/configs/**`，不包含业务配置，也不访问代理存储。

## 接口

| HTTP 方法 | 路径 | 负责产物 | 用途 |
| --- | --- | --- | --- |
| GET | `/settings/{module}` | `web.js` | 通用模块 HTML |
| GET | `/settings/assets/index.mjs` | `web.js` | 读取 BoxJS 并挂载设置页 |
| GET | `/settings/assets/navigation.mjs` | `web.js` | 通用宿主组件 |
| HEAD | `/api/{module}` | `api.js` | 探测配置并透传版本 |
| POST | `/api/{module}/get` | `api.js` | 读取字段或 Settings/Caches 子树 |
| POST | `/api/{module}/set` | `api.js` | 写入 BoxJS 已声明字段 |
| POST | `/api/{module}/delete` | `api.js` | 删除字段或模块子树 |
| HEAD、GET | `/configs/{module}` | 业务模块 | 提供版本化 BoxJS |

`GET /api/{module}`、旧 `/api/get|set|delete`、`/api/module/{module}` 和未规定方法都不属于公开契约。匹配到 API 路径但方法不正确时返回 `405`。

## 配置来源

页面、探测和持久化动作都固定使用同源 `/configs/{module}`。不接受自定义配置来源、页面 CSS 参数或 PreferencePanes 私有请求头。

`HEAD /api/{module}` 向同源配置发送 HEAD，使用上游状态码并透传 `X-PreferencePanes-Version`；网络失败返回 `502`。

模块页面向同源配置发送 GET。成功后将原始 JSON 直接传给 `mount(boxjs)`；失败时显示可重试状态。BoxJS 语法、控件语义、展示元数据、默认值和已存值由浏览器侧校验。

## JSON 动作

三个动作都使用 `Content-Type: application/json`，正文最大 65536 字符。API 在每次动作前读取 `/configs/{module}`，从字段 ID 建立本模块允许访问的完整路径目录。

读取 Settings 或 Caches：

```http
POST /api/Enhanced/get
Content-Type: application/json

{"scope":"settings"}
```

`scope` 可为 `settings`、`caches` 或 `module`；也可用 `{"key":"Enhanced.Settings.Home.Top_left"}` 读取一个已声明字段。缺失返回 `404`，成功返回原始 JSON 值。

写入字段：

```http
POST /api/Enhanced/set
Content-Type: application/json

{"key":"Enhanced.Settings.Home.Top_left","value":"mine"}
```

API 只确认 `key` 对应当前 BoxJS 中的完整字段 ID，再把 `@root.path` 直接交给 util `Storage.setItem`。值的控件类型与枚举由浏览器校验。成功返回 `{"saved":true}`。

删除字段或子树：

```http
POST /api/Enhanced/delete
Content-Type: application/json

{"scope":"caches"}
```

字段删除使用 `key`；子树删除使用 `scope`。删除 `module` 仅移除当前模块，保留同一存储根中的其它模块。成功返回 `{"deleted":true}`。

`400` 表示动作正文、字段或 scope 无效，`405` 表示方法错误，`415` 表示正文类型错误，`422` 表示 BoxJS 无法建立字段目录，`500` 表示存储错误，`502` 表示配置请求失败。所有响应均为 `no-store`。

## 页面渲染

`index.mjs` 从模块 URL 取得模块名，GET `/configs/{module}` 后调用公开 `mount(boxjs)`。`mount()` 同步返回 `destroy()` 生命周期句柄；内部面板通过一次 POST get 建立 Settings 快照。

写入成功后只更新当前页面快照。失败恢复控件并保留快照；重新进入页面才重新加载 BoxJS 与 Settings。查看 Settings/Caches 按需读取，清空缓存和重置调用 delete。

## 安装与发布

一个宿主只安装一次 `web.js` 并覆盖全部合法 `/settings/**` 页面和公共资源。每个业务模块分别提供自己的 `/configs/{module}` 和 `/api/{module}` 规则。

Biliverse 由 Enhanced 唯一安装通用 `web.js`；Global、Redirect、ADBlock 不携带页面 provider。Release 同时发布 `api.js` 和 `web.js`，但业务模块根据职责选择对应产物。
