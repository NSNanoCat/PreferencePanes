# PreferencePanes 模块设置页规范（未发布）

## 职责边界

PreferencePanes 只渲染和处理某个具体模块的设置。项目定制首页由 github.io 等调用方独立托管，布局、品牌与入口目录均不属于本包。主页只需 HEAD 对应 JSON/配置 Mock：不可访问则禁用入口。

本包不生成主页、不生成模块选择目录、不提供主页安装选择器，也不接管 `/settings/`。JSON 与 CSS 的输入对象都只针对一个模块页。

## 唯一配置输入

构建入口为 `build(boxjs, css?)`，浏览器入口为 `mount(boxjs, css?)`。boxjs 是已解析且恰好包含一个模块的 BoxJS JSON；css 是可选 CSS 正文。省略时使用默认模块样式，提供时只加载到模块文档。嵌入宿主页面时使用独立页面或 iframe，避免 CSS 影响宿主。CSS 资源应使用绝对或站点根相对 URL。

不再接受独立菜单、安装映射、资源表、origin、storageKey、module、requestHeader、stylesheets 配置。宿主请求、当前 URL、DOM 和存储 API 是运行环境，不是额外配置输入。旧版参数及导出不保留兼容层。

~~~js
import { build } from "@nsnanocat/preference-panes";
import boxjs from "./settings.boxjs.json" with { type: "json" };

const files = await build(boxjs, ".pp-panel { --pp-accent: #16866a; }");
~~~

files 是该模块的相对路径到正文的映射，包含模块 HTML、CSS、BoxJS、读写与配置响应脚本，以及公共启动 JS。文件名按模块分开，可合并多个独立模块的产物；不会生成或覆盖项目的 settings/index.html。

已有模块 WebView 导入 `@nsnanocat/preference-panes/browser` 的 mount，调用后直接显示导入 JSON 对应的表单，不先显示入口目录，也不从当前 URL 选择另一模块。destroy() 释放模块资源。无需额外导入默认 CSS。

## BoxJS 推导

支持字段数组、单 app（settings 数组）和仅含该模块的 apps 订阅。ID `@Root.Module.Settings.key` 定义根、模块与子路径。零个或多个模块的输入报错，不会生成选择菜单。

同一模块必须使用同一根；同名模块跨根时拒绝输入。不同模块可以使用不同根。app 的 id/name 不覆盖字段路径。不从只含旧式平面键的 app 名称推测存储位置。

模块标题和说明使用标准 name、icon、icons、author、desc、descs、description、repo。icons 保留透明/彩色顺序，不解释为亮暗模式。script 仅保留，不执行。文本通过 textContent 展示，图标和链接只允许 HTTP(S) 或相对地址。

支持 boolean、selects、checkboxes、text、textarea、number。name、val、items、desc、placeholder、rows、autoGrow 由浏览器解释。共同数据目录只索引字段路径和元数据，存储操作不解析控件或校验枚举。

## 固定相对路径

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | /settings/ | 调用方定制首页，不属于 PreferencePanes |
| GET | /settings/{module} | 该模块的页面启动器导入 JSON 与 CSS，再渲染模块 |
| HEAD、GET | /configs/{module} | 业务模块的配置 Mock |
| HEAD、GET、POST、DELETE | /api/{module}/ | 模块数据操作 |
| HEAD、GET、POST、DELETE | /api/{module}/{path} | 任意键或子树操作 |
| GET、DELETE | /api/{module}/Caches | 查看、清空缓存 |

module 来自 BoxJS 字段 ID。path 用 / 分层，每段独立编码，不把分隔斜线编码为 %2F。路径段允许字母、数字、下划线和连字符，拒绝空片段及 __proto__/prototype/constructor。

模块资源位于 /settings/assets/{module}.html、{module}.boxjs.json、{module}.css、{module}.request.js、{module}.config.js。app.mjs 为公共启动 JS。CSS 可以为空。不存在全局菜单 boxjs.json 或全局 custom.css 输入文件。

## 入口可用性与导入测试

项目主页自行 HEAD /configs/{module}，HTTP 200 才启用入口。API 可达不能替代 JSON 可达。这个探测逻辑不在 PreferencePanes 模块渲染器中。

模块页面启动器 GET 对应 JSON 和模块 CSS，再调用 mount；JSON 缺失或模块与 URL 不符时不生成表单。调用方直接传给 mount 的 JSON 已经完成导入，渲染器不会再次访问配置或探测其它模块。

`npm run preview` 打开开发测试台。选择模块 JSON、可选 CSS，点击“生成”后在 iframe 查看模块页。初始不装入示例，不生成项目首页，CSS 不影响导入表单。测试 API 使用独立内存，不读写用户代理数据。

代理只处理该模块的数据和页面，不接管项目主页、其它模块页或 /configs/。配置响应脚本只返回 JSON，不读写存储。

## 读取与缓存

每次打开、再次进入或刷新模块页面：

1. 启动器导入该模块 JSON 与 CSS；直接使用 mount 时由调用方传入已导入的数据。
2. 渲染器从该 JSON 解析控件、默认值和存储路径，不重复请求配置。
3. GET 字段公共子树一次，例如 /api/Module/Settings/。
4. 在模块文档内存中保存快照；子树 404 代表无覆盖值，使用默认值。

单选为下拉框，多选为二级选项页。修改立即串行 POST，HTTP 200 后更新内存并通知，不追加 GET；失败恢复已有值。二级前进/后退保留滚动和缓存，不刷新设置。重新打开或刷新模块文档时重新导入和读取。

不展示逐字段保存或删除按钮。内部客户端和 API 保留单键 DELETE。离开后丢弃会话，已发送写入可以完成，但不会恢复已销毁的缓存。

## 存储操作

代理从构建输入的 BoxJS 路径目录取得根。GET 读一次；POST/DELETE 读取最新根，用 util 的 Storage/Lodash 修改目标并写回一次。不下载 BoxJS，不接受浏览器指定存储根。

例如字段 ID 为 `@BiliBili.Enhanced.Settings.Home.Top_left`：

~~~http
POST /api/Enhanced/Settings/Home/Top_left
Content-Type: application/json
X-Settings-Client: 1

"mine"
~~~

写入 BiliBili.Enhanced.Settings.Home.Top_left。POST 正文就是 JSON 值，可为对象、数组、null、字符串、数字或布尔值；替换该位置而非合并。字段不必在 BoxJS 中声明，但模块必须有可推导的绑定。

GET 返回原值，缺失 404，不合并默认值。DELETE 删除键或子树，不存在也成功。POST 成功正文为 `{"saved":true}`，DELETE 为 `{"deleted":true}`。HEAD 仅诊断 API，不读存储，也不代表设置界面可用。

历史 JSON 字符串中间节点在遍历时解码；直接 GET 字符串叶子仍返回字符串。标量父节点不能遍历时返回 500，不覆盖原值。数组通过数字路径访问；删除数组键不移动其它索引。多个代理上下文并发写同一根仍无事务隔离。

## Caches 与重置

查看/刷新 Caches 按需 GET /api/{module}/Caches，不在进入页面时自动读取。清空经确认 DELETE 此路径；重置经确认 DELETE /api/{module}/，保留其它模块与其它根。

成功后只更新本页内存，不追加 GET。重置使用已加载的 BoxJS 默认值，再次进入时重新读取。

## 响应约定

固定标记为 X-Settings-Client: 1，不是认证凭据，不能配置改名。Origin 若存在必须等于目标请求 URL 的 origin。来源自动取运行环境。POST 上限 65536 个 UTF-16 code units。

| 状态 | 含义 |
| --- | --- |
| 200 | 成功；HEAD 无正文 |
| 400 | 路径或 JSON 无效 |
| 403 | 标记缺失或异源 |
| 404 | 模块未在 BoxJS 声明，或路径不存在 |
| 405 | 方法不支持 |
| 413 | 正文过长 |
| 415 | 非 application/json |
| 500 | 存储、遍历或执行失败 |

框架响应使用 Cache-Control: no-store。配置 Mock 失败状态由代理或原站决定。Apifox 路径参数不预填业务实例，示例只写在说明中。
