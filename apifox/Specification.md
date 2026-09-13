# PreferencePanes API 规范

## 职责

业务模块按版本提供 `/configs/{module}` 的 BoxJS JSON，并与业务脚本使用同一个 `X-PreferencePanes-Version`。该路径只属于业务模块与后端之间的配置来源，不是网页接口。

PreferencePanes 的 `api.js` 负责两件事：通过 `/api/{module}` 探测或原样转发对应 BoxJS，以及通过固定 `/api/get|set|delete` 操作本地存储。它不解析 BoxJS，不建立字段目录，不解释控件、选项、默认值或展示元数据。

PreferencePanes 的 `web.js` 只返回通用模块 HTML、`index.mjs` 和 `navigation.mjs`。浏览器通过 API 取得 BoxJS，并负责规范化、界面生成、字段和值校验。

## 接口

| HTTP 方法 | 路径 | 负责产物 | 用途 |
| --- | --- | --- | --- |
| GET | `/settings/{module}` | `web.js` | 通用模块 HTML |
| GET | `/settings/assets/index.mjs` | `web.js` | 读取 BoxJS 并挂载设置页 |
| GET | `/settings/assets/navigation.mjs` | `web.js` | 通用宿主组件 |
| HEAD | `/api/{module}` | `api.js` | 探测配置并透传版本 |
| GET | `/api/{module}` | `api.js` | 原样返回 BoxJS JSON |
| POST | `/api/get` | `api.js` | 读取完整存储路径 |
| POST | `/api/set` | `api.js` | 写入完整存储路径 |
| POST | `/api/delete` | `api.js` | 删除完整存储路径或子树 |
| HEAD、GET | `/configs/{module}` | 业务模块 | 为后端提供版本化 BoxJS |

`/api/{module}/get|set|delete`、`/api/module/{module}` 和未规定路径不属于公开契约，也不提供兼容处理。

## 模块配置

`HEAD /api/{module}` 和 `GET /api/{module}` 固定访问同源 `/configs/{module}`，不接受自定义来源或私有请求头。

HEAD 使用上游状态码并透传 `X-PreferencePanes-Version`，不返回正文。GET 原样返回上游 BoxJS 正文、媒体类型、状态码和版本头；后端不调用 `JSON.parse`，因此 BoxJS 语法与语义错误由浏览器处理。网络失败返回 `502`。

模块页面从 URL 取得模块名，GET `/api/{module}` 后在浏览器中解析 BoxJS。配置必须包含请求模块的字段，并且输入最终只能描述一个可挂载模块。

## Form 存储

三个存储动作都使用 `Content-Type: application/x-www-form-urlencoded`，正文最大 65536 字符且必须恰好包含一个字段。字段名是完整 `@root.path`，至少包含存储根和一个子路径；读取和删除的字段值留空。

读取 Settings：

```http
POST /api/get
Content-Type: application/x-www-form-urlencoded

%40BiliBili.Enhanced.Settings=
```

写入字段：

```http
POST /api/set
Content-Type: application/x-www-form-urlencoded

%40BiliBili.Enhanced.Settings.Home.Top_left=%22mine%22
```

前端统一先执行 `JSON.stringify(value)`，再用 `URLSearchParams` 编码。合法 JSON 保留布尔、数值、字符串、数组、对象或 null 类型；无法解析为 JSON 的值按普通字符串保存。

删除字段、Caches 或整个模块分别使用对应完整路径。不存在的路径删除仍返回 `200`，但不允许直接操作整个存储根。

Store 每次操作读取当前根对象，用 util Lodash 定位子路径，并在写入或删除后写回一次。它保留同一根下的其它模块，并兼容旧存储中的 JSON 字符串中间节点。

get 成功返回原始 JSON 值，缺失返回 `404`。set 返回 `{"saved":true}`，delete 返回 `{"deleted":true}`。`400` 表示 form 或路径错误，`405` 表示方法错误，`415` 表示正文类型错误，`500` 表示存储错误。所有响应均为 `no-store`。

## 浏览器行为

浏览器解析完整字段 ID，推导 storage root、模块名、Settings 公共路径和字段路径。初始化通过 `/api/get` 读取 Settings；字段保存和删除使用完整字段路径；Caches 使用 `@root.{module}.Caches`；模块重置使用 `@root.{module}`。

BoxJS 控件、选项、默认值、字段重叠、已存值和待写入值都在浏览器中校验。非法配置或值不会产生存储请求。写入成功后只更新当前页面快照，不追加 GET；重新进入模块时重新获取 BoxJS 和 Settings。

## 安装与发布

一个宿主只安装一次 `web.js` 和一次 `api.js`。`web.js` 覆盖全部合法 `/settings/**` 页面；`api.js` 覆盖全部 `/api/{module}` 及固定 `/api/get|set|delete`。

每个业务模块只提供自己的 `/configs/{module}`。Biliverse 中由 Enhanced 唯一安装通用前后端；Global、Redirect、ADBlock 只携带各自 BoxJS 响应规则。Release 分别发布 `api.js` 和 `web.js`，不合并前后端职责。
