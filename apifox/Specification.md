# PreferencePanes API 规范

## 职责

业务模块按版本将自己的 BoxJS JSON 直接 Mock 到 `/api/{module}`，并与业务脚本使用同一个 `X-PreferencePanes-Version`。模块 API 不经过 PreferencePanes 后端，也不存在 `/configs/{module}` 上游路径。

PreferencePanes 的 `api.js` 只通过固定 `/api/get|set|delete` 操作本地存储。它不请求网络、不解析 BoxJS、不建立字段目录，也不解释控件、选项、默认值或展示元数据。

PreferencePanes Release 独立发布通用模块 HTML、`index.mjs` 和 `navigation.mjs`，消费方必须逐文件映射，不执行页面响应脚本。静态模块页可声明调用方指定的 BoxJS JSON 与项目 stylesheet 资源；浏览器取得 BoxJS 后负责规范化、界面生成、字段和值校验。

## 接口

| HTTP 方法 | 路径 | 负责产物 | 用途 |
| --- | --- | --- | --- |
| GET | `/settings/{module}` | `index.html` | 可选 BoxJS 与项目 stylesheet 输入的通用模块 HTML |
| GET | `/settings/assets/index.mjs` | `index.mjs` | 读取 BoxJS 并挂载设置页 |
| GET | `/settings/assets/navigation.mjs` | `navigation.mjs` | 通用宿主组件 |
| HEAD | `/api/{module}` | 业务模块模板 | 探测模块与版本 |
| GET | `/api/{module}` | 业务模块模板 | 原样返回 BoxJS JSON |
| POST | `/api/get` | `api.js` | 读取完整存储路径 |
| POST | `/api/set` | `api.js` | 写入完整存储路径 |
| POST | `/api/delete` | `api.js` | 删除完整存储路径或子树 |

`/configs/{module}`、`/api/{module}/get|set|delete`、`/api/module/{module}` 和未规定路径不属于公开契约，也不提供兼容处理。`get`、`set`、`delete` 是保留路径段，不得作为模块名。

## 模块配置

业务模板对精确 `/api/{module}` 提供 HEAD 和 GET；允许 query，不接受尾随斜杠。HEAD 返回 200、空正文、`Content-Type: application/json`、`Cache-Control: no-store` 和非空 `X-PreferencePanes-Version`。GET 返回相同状态与 Header，并原样返回对应版本的 BoxJS JSON。

模块页面从 URL 取得模块名，读取 HTML 声明的 BoxJS 资源后在浏览器中解析。未声明时默认 GET `/api/{module}`。配置必须包含请求模块的字段，并且输入最终只能描述一个可挂载模块。配置语法、控件、字段和值错误均由浏览器拒绝。

## 模块页面资源

`GET /settings/{module}` 映射同一份静态 `index.html`，并接受可选 `json`、`css` 查询参数。嵌入 `ModuleFrame` 时，构造参数中的 `X-PreferencePanes-JSON`、`X-PreferencePanes-CSS` 用作本地页面输入并优先于查询参数，不作为网络 Header 发送。BoxJS 地址未指定时默认为 `/api/{module}`；空 BoxJS Header 无法形成资源地址并抛出错误。CSS 地址未指定时不加载项目 stylesheet；空 CSS Header 表示不提供额外样式。

两个资源地址都按模块页面 URL 解析，最终协议必须是 HTTP(S)，否则页面拒绝加载。`ModuleFrame` 将合法地址写入 iframe dataset；独立页面直接读取查询参数。页面脚本只请求 BoxJS 地址，并为 CSS 地址创建 `<link data-preference-panes-stylesheet>`。页面运行时先安装包内默认样式，因此项目 stylesheet 具有更高的级联优先级。

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

## 演示与验收

`examples/Module.boxjs.json` 是通用设置前端的内置验收配置，必须覆盖 `boolean`、`selects`、`checkboxes`、`text`、`textarea`、`number` 和 `url` 全部受支持控件。控件类型或行为发生变化时，必须同步更新该配置与预览测试。

`npm run preview` 启动本地测试台后必须自动加载内置配置，并继续允许导入外部 BoxJS JSON。顶端 CSS 选择器默认使用包内置 CSS，并允许切换仓库示例 CSS 或导入本地 CSS。预览服务器必须直接提供正式构建的静态模块页和 JS 文件，以 JSON/CSS 查询参数输入资源地址，并使用固定存储 API；演示不得复制或替代生产渲染流程。

内置预览使用独立内存存储注入当前配置未定义的选项、无法由控件表示的值，以及 URL 字段同路径的旧存储值。验收时应确认前两类问题只在对应字段下显示非阻断警告，页面其余控件仍可使用；URL 字段忽略旧存储值并继续使用 BoxJS `val`。

## 安装与发布

一个宿主只映射一次 `index.html`、`index.mjs`、`navigation.mjs`，并安装一次 `api.js`。三个页面文件分别覆盖规范路径；`api.js` 只覆盖固定 `/api/get|set|delete`。

每个业务模块提供自己的 `/api/{module}`。Biliverse 中由 Enhanced 唯一映射通用前端并安装固定存储 API；Global、Redirect、ADBlock 只携带各自 BoxJS API Mock。Release 分别发布三个静态页面文件和 `api.js`，不再生成或发布 `web.js`。
