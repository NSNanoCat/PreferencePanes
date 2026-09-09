# PreferencePanes 接口规范（两输入重构版，未发布）

## 唯一配置输入

构建入口为 `build(boxjs, css?)`，浏览器入口为 `mount(boxjs, css?)`。boxjs 是已解析的 BoxJS JSON，css 是可选 CSS 正文字符串。省略 CSS 时使用内置默认样式，提供时在默认样式之后覆盖。CSS 资源应使用绝对或站点根相对 URL。

不再接受独立菜单、安装映射、资源表、origin、storageKey、module、requestHeader、stylesheets 配置。宿主请求、当前 URL、DOM 和存储 API 是运行环境，不是额外配置输入。旧版参数及导出不保留兼容层。

~~~js
import { build } from "@nsnanocat/preference-panes";
import boxjs from "./settings.boxjs.json" with { type: "json" };

const files = await build(boxjs, ".pp-panel { --pp-accent: #16866a; }");
~~~

files 是相对路径到文件正文的映射。调用方只需写出并托管。HTML、JS、默认样式、输入资源、通用代理和各模块配置 Mock 全由包生成，无需拼接脚本或维护第二份元数据。

已有 WebView 导入 `@nsnanocat/preference-panes/browser` 的 mount，调用 `mount(boxjs, css?)`；返回值的 destroy() 释放样式、监听器、会话和页面。无需额外导入默认 CSS。

## BoxJS 推导

支持字段数组、单 app（settings 数组）和 apps 订阅。ID `@Root.Module.Settings.key` 直接定义存储根 Root、模块 Module 和子路径 Settings.key。

同一模块必须使用同一根；同名模块跨根时拒绝输入。不同模块可以使用不同根。app 的 id/name 不覆盖字段路径。不从只含旧式平面键的 app 名称推测存储位置。

菜单和模块展示使用标准 name、icon、icons、author、desc、descs、description、repo。icons 保留透明/彩色顺序，不解释为亮暗模式。script 仅保留，不执行。文本通过 textContent 展示，图标和链接只允许 HTTP(S) 或相对地址。

支持 boolean、selects、checkboxes、text、textarea、number。name、val、items、desc、placeholder、rows、autoGrow 由浏览器解释。共同数据目录只索引字段路径和元数据，存储操作不解析控件或校验枚举。

## 固定相对路径

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | /settings/ | 从输入 BoxJS 生成模块菜单 |
| GET | /settings/{module} | 同一通用页面，按路径打开模块 |
| HEAD、GET | /configs/{module} | 业务模块的配置 Mock |
| HEAD、GET、POST、DELETE | /api/{module}/ | 模块数据操作 |
| HEAD、GET、POST、DELETE | /api/{module}/{path} | 任意键或子树操作 |
| GET、DELETE | /api/{module}/Caches | 查看、清空缓存 |

module 来自 BoxJS 字段 ID。path 用 / 分层，每段独立编码，不把分隔斜线编码为 %2F。路径段允许字母、数字、下划线和连字符，拒绝空片段及 __proto__/prototype/constructor。

包管理 /settings/assets/ 下的 app.mjs、boxjs.json、custom.css 和页面资源。boxjs.json 就是构建输入的原生 BoxJS，不是另一种菜单配置。custom.css 可以为空，默认样式内置在浏览器模块中。

## 安装与可用性

主页安装工具按当前 URL 生成 Surge、Loon、Quantumult X、Stash、Shadowrocket 安装文件，无需传入域名。安装内容分为通用模块与业务配置 Mock。

通用模块接管 /api/ 与自身页面资源，绝不接管 /configs/。业务模块只安装配置 Mock。Surge/Loon 使用原生远程 JSON Mock，其它平台使用包生成的配置响应脚本；该脚本只返回 BoxJS，不访问存储或网络。

每次进入主菜单仅并发 HEAD /configs/{module}，只有 HTTP 200 启用入口。API 可达不能替代 Mock。HEAD 不检查正文；打开后的 GET 校验 JSON。配置缺失、无字段或解析失败时不显示表单、不读取设置 API。

## 读取与缓存

每次打开、再次进入或刷新模块页面：

1. GET /configs/{module} 一次，实时解析控件和默认值。
2. 确认 Mock 的存储根与输入 BoxJS 推导的根一致，禁止 Mock 改写存储绑定。
3. GET 字段公共子树一次，例如 /api/Module/Settings/。
4. 在当前页面内存保存快照；子树 404 代表无覆盖值，使用 BoxJS 默认值。

单选为下拉框，多选为二级选项页。控件修改立即串行 POST，HTTP 200 后更新内存并显示通知，不追加 GET；失败恢复已有值，不覆盖较新的输入。二级页前进/后退保留滚动和缓存；回到主菜单再进入则重新读取。

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
