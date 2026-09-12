# PreferencePanes 模块 API 规范

## 职责

业务模块按版本提供 `/configs/{module}` 的 BoxJS JSON Mock，并与业务脚本使用同一个 `X-PreferencePanes-Version`。PreferencePanes 的代理脚本负责取得该 JSON、根据字段 ID 映射本地存储路径、读取当前值，以及执行写入和删除。

浏览器不直接请求 `/configs/{module}`，也不拼接 `@root.path`。浏览器只调用模块 API，收到原始 BoxJS 与已存值后，在 Web 侧完成控件规范化、展示属性校验、已存值校验和页面渲染。代理 API 不解释控件类型、选项、默认值或 CSS，不生成 Web DOM。

`Navigation` 只管理页内历史、前进后退和切换动画；`ModuleFrame` 只管理模块 iframe；`ModuleStatus` 只调用模块 API 并显示探测结果。客户端 Bridge、项目主页和原生导航仍由调用方负责。

## 接口

| HTTP 方法 | 路径 | 调用方 | 用途 |
| --- | --- | --- | --- |
| GET | `/settings/{module}` | 浏览器 | 通用模块 HTML |
| GET | `/settings/assets/app.mjs` | 浏览器 | 模块 API 调用与渲染入口 |
| GET | `/settings/assets/navigation.mjs` | 浏览器 | Navigation、ModuleFrame、ModuleStatus |
| HEAD | `/api/{module}` | 浏览器 | 由 API 探测 BoxJS 上游并透传状态、版本 |
| GET | `/api/{module}` | 浏览器 | 由 API 取得 BoxJS 并读取当前字段值 |
| POST | `/api/{module}/get` | 浏览器 | 读取字段或 Settings/Caches 子树 |
| POST | `/api/{module}/set` | 浏览器 | 写入 BoxJS 中已声明的字段 |
| POST | `/api/{module}/delete` | 浏览器 | 删除字段、Settings、Caches 或模块子树 |
| HEAD、GET | `/configs/{module}` | 代理 API | 业务模块提供的版本化 BoxJS 上游 |

旧的 `/api/get`、`/api/set`、`/api/delete` form 接口和 `/api/module/{module}` 草稿路径均不保留。网页不能提交完整存储根；所有路径都由 API 从本次取得的 BoxJS 字段 ID 推导。

## 配置来源

模块 API 默认从同源 `/configs/{module}` 获取 JSON。自定义来源通过 `X-PreferencePanes-JSON` 传入，接受 HTTP(S) 绝对地址或同源相对地址。模块页的 `json` 查询参数和页面请求上的同名 Header 最终只用于构造模块 API 请求，浏览器不会直接下载该 JSON。

`HEAD /api/{module}` 由代理脚本向配置来源发送 HEAD，原样使用上游状态码，并透传 `X-PreferencePanes-Version`。网络失败返回 502。主页每次进入时并发调用四个模块 API，而不是直接探测配置 Mock。

`GET /api/{module}` 由代理脚本向配置来源发送 GET，返回：

```json
{
  "module": "Enhanced",
  "boxjs": { "apps": [] },
  "values": {
    "Enhanced.Settings.Home.Top_left": "mine"
  },
  "configURL": "https://app.bilibili.com/configs/Enhanced"
}
```

`boxjs` 是上游原始 JSON；`values` 只包含实际已保存的字段值，不补默认值、不转换控件类型。`configURL` 供同一页面后续动作继续指定同一来源。JSON 语法或字段 ID 目录无法建立时返回 422；控件类型、选项、默认值和展示元数据是否可渲染由浏览器校验。

## JSON 动作

三个动作都使用 `Content-Type: application/json`，正文最大 65536 字符。

读取 Settings 或 Caches：

```http
POST /api/Enhanced/get
Content-Type: application/json
X-PreferencePanes-JSON: /configs/Enhanced

{"scope":"settings"}
```

`scope` 可为 `settings`、`caches` 或 `module`；也可用 `{"key":"Enhanced.Settings.Home.Top_left"}` 读取一个已声明字段。缺失返回 404，成功返回原始 JSON 值。

写入字段：

```http
POST /api/Enhanced/set
Content-Type: application/json
X-PreferencePanes-JSON: /configs/Enhanced

{"key":"Enhanced.Settings.Home.Top_left","value":"mine"}
```

API 只确认 `key` 对应本次 BoxJS 中的完整字段 ID，再通过 util Storage/Lodash 写入；值的控件类型和枚举已经由 Web 校验，API 不重复解释。成功返回 `{"saved":true}`。

删除字段或子树：

```http
POST /api/Enhanced/delete
Content-Type: application/json
X-PreferencePanes-JSON: /configs/Enhanced

{"scope":"caches"}
```

字段删除使用 `key`；子树删除使用 `scope`。删除 `module` 只移除当前模块，保留同一存储根中的其它模块。成功返回 `{"deleted":true}`，不存在的路径也视为完成。

400 表示动作正文、字段或 scope 无效，405 表示方法错误，415 表示正文类型错误，422 表示 BoxJS JSON 无法建立安全字段目录，500 表示存储错误，502 表示上游请求失败。所有响应均为 `no-store`。

## 页面渲染

`app.mjs` 并发读取可选 CSS 与 `GET /api/{module}`，然后把 API 模型交给浏览器 `mount()`。`mount()` 从 `boxjs` 生成控件定义，校验展示元数据、控件类型、选项、默认值和 `values`，再绘制页面。无效模型只在页面显示加载失败，不会由 API 生成或修补控件。

修改控件时，浏览器先按渲染定义校验值，再把字段路径和值提交给模块 API。HTTP 200 后只更新当前页面快照；失败恢复控件。查看设置和缓存按需调用 `get`，清空缓存和重置调用 `delete`，均不直接接触持久化实现。

## 发布

Release 只发布包含模块 HTML、浏览器资源和模块 API 的 `api.js`。业务模块引用 `https://github.com/NSNanoCat/PreferencePanes/releases/latest/download/api.js`。必须先发布支持新路径的通用 API，再更新调用 `/api/{module}` 的项目主页和模块模板。
