# @nsnanocat/preference-panes

通用 WebView 设置面板与代理持久化存储桥接。0.3.0 起，BoxJS 完全由前端解析；API 只按安装配置中的根和模块读写数据，不下载配置、不重复校验字段或枚举。

## 目录

| 目录 | 内容 |
| --- | --- |
| src/SettingsHandler.mjs | 模块存储桥接 class |
| src/PreferencesHandler.mjs | 存储桥接与声明式静态资源响应 |
| src/browser/ | WebView 控件、内存会话和样式 |
| src/lib/ | 前端 BoxJS 与通用路径解析 |
| src/proxy/ | 代理宿主打包入口 |
| test/ | 类型与行为回归测试 |
| examples/ | BoxJS、HTML 和 Surge 集成示例 |
| apifox/ | 接口说明、原生 JSON 与生成器 |
| .github/ | CI、双平台发布工作流 |
| dist/ | 构建产物，不提交 Git |

Biome 与 NSNanoCat Util/FlatBufferRoot 对齐：tab、LF、320 列，保留统一 lint 规则。类型声明位于 src/index.d.ts 和 src/browser/index.d.ts，JSDoc 使用中英双语。

## 代理接口

~~~js
import { SettingsHandler } from "@nsnanocat/preference-panes";

const handler = new SettingsHandler({
  origin: "https://example.org",
  storageKey: "Root",
  module: "Module"
});
const response = await handler.handle($request);
// 使用现有代理宿主的 done 适配。
// Adapt the response with the existing proxy host's done function.
~~~

安装配置固定 Root.Module，浏览器不能通过 header 指定其它根。API 不接受 configURL、loadConfig 或 resolveSettings，也不依赖 BoxJS 是否可用。

| 请求 | 行为 |
| --- | --- |
| HEAD /api/Module/… | 确认路由可达，不读取存储 |
| GET /api/Module/Settings/key | 返回原值，缺失返回 404 |
| POST /api/Module/Settings/key | 以任意 JSON 值替换该位置，成功 200 |
| DELETE /api/Module/Settings/key | 删除键或子树，不存在也成功 |
| GET /api/Module/Caches | 返回所有 Caches |
| DELETE /api/Module/Caches | 清空缓存，保留 Settings |
| DELETE /api/Module/ | 重置模块全部数据，保留 Root 下其它模块 |

POST 正文就是值本身，允许对象、数组、null、字符串、数字或布尔值。不存在于 BoxJS 中的键也允许读写。使用 util Storage/Lodash 做根对象读改写，保留同级数据；每次 GET 读一次根，POST/DELETE 读一次再写一次，不发网络请求。仍检查模块归属、路径格式、请求来源、JSON 语法和正文大小；不做 BoxJS 业务校验。

## WebView

~~~js
import { mountPreferencePanes } from "@nsnanocat/preference-panes/browser";
import "@nsnanocat/preference-panes/browser/panel.css";

const panel = mountPreferencePanes({ element: document.querySelector("#preferences") });
// 卸载时调用 panel.destroy()。
// Call panel.destroy() when unmounting.
~~~

同一份 HTML 从 /settings/{module} 读取模块名，再 GET /configs/{module} 取得 BoxJS 并生成控件。配置源地址写在模块的 Mock 规则中，不写入页面 query 参数或 API。

每次进入主菜单仅并发 HEAD 各配置 Mock。打开、再次进入或刷新模块页，各 GET 一次 BoxJS 与设置子树；404 的设置子树按无覆盖值处理。保存/删除根据 HTTP 200 更新页面缓存并显示通知，不追加 GET。

设置页使用分组行布局：单选为下拉框，开关为即时切换，多选显示摘要并进入可前进/后退的二级选项页。文本输入、下拉选择及勾选变化均立即串行 POST，无逐项保存或删除按钮；失败恢复当前项已保存值，较新的输入不会被较早请求覆盖。多选页返回时保留主列表滚动位置，不重新 GET 配置。单键 DELETE 能力保留在 API/客户端方法中，不作为逐项页面按钮展示。

模块页底部提供查看/刷新 Caches、清空 Caches 和重置模块。查看缓存按需 GET；清空和重置经确认后 DELETE，成功只更新本页状态。重置后控件显示当前 BoxJS 默认值，再次进入页面才重新读取。模块选择、设置值校验和默认值处理都在前端完成。

主菜单、导航、控件和样式均由本包实现。业务插件只提供 BoxJS JSON；品牌、菜单、图标与安装映射属于托管站点。插件不导入本包、不维护页面代码，也不把设置请求接入自己的业务 Request。未提供对应配置 Mock 的插件入口保持禁用。

## 零前端代码接入

托管站点安装本包，部署 `dist/settings/` 到 `/settings/assets/`，将其中 index.html 同时用于 `/settings/` 与 `/settings/{module}`。根菜单读取由站点维护的 `site.boxjs.json`，这份主菜单不放在业务插件仓库：

~~~json
{
  "name": "Example",
  "icon": "/assets/logo.png",
  "sectionTitle": "模块",
  "apps": [{ "module": "Module", "name": "Example Module", "icon": "/assets/module.png" }]
}
~~~

`apps[].module` 明确对应 `/settings/{module}`、`/configs/{module}` 和 `/api/{module}/`，不从名称推断。这个菜单 JSON 只声明入口；实际字段仍从配置 Mock 返回的 BoxJS 生成。菜单可选 `desc`、`iconDark` 和 `stylesheets`；`iconDark` 是显式暗色图标扩展，不能把 BoxJS 的透明/彩色 icons 当成亮暗版本。stylesheets 仅加载接入方指定的 HTTP(S) 样式，不加载业务 JS。

根页面每次进入重新 HEAD 探测，菜单 JSON 在当前文档只读取一次；模块页直接打开时无需先读菜单。图片与额外样式由托管站点提供。

代理优先使用原生 Mock 提供配置和页面。存储 API 和没有原生 Mock 的资源请求，由独立代理脚本处理。托管站点维护 installation JSON（origin/storageKey/module/resources），并用包内已经构建好的代理运行时生成安装文件：

~~~js
import { readFile, writeFile } from "node:fs/promises";

const runtime = await readFile(new URL(import.meta.resolve("@nsnanocat/preference-panes/dist/preference-panes.proxy.js")), "utf8");
const installation = JSON.parse(await readFile("installation.json", "utf8"));
await writeFile("PreferencePanes.request.js", `${runtime}\nPreferencePanes.runPreferences(${JSON.stringify(installation)});\n`);
~~~

通用运行时由独立 PreferencePanes 代理模块安装一次，统一匹配 /api/ 与页面资源；业务插件不再安装读写或页面规则，只提供 /configs/{module} 的配置 Mock。安装映射的 module 可以是模块名数组，例如 ["Module", "Other"]，统一模块只能访问声明范围。生成文件不依赖 $argument，Quantumult X 也使用同一文件。API 不下载安装 JSON 或 BoxJS。

独立模块不得匹配 /configs/，资源映射也不得为配置 Mock 提供兜底。主菜单每次进入只 HEAD 配置 Mock；HTTP 200 启用入口，打开后 GET 并解析 JSON。配置缺失、无有效字段或解析失败时不读取设置 API、不生成设置表单。API 可达不代表某个业务模块提供了设置界面。

Surge/Loon 的业务插件使用原生 JSON Mock。需要脚本响应配置的平台，由托管站点将包内 dist/preference-panes.config.js 与 `PreferencePanes.mockConfiguration(BoxJS_JSON)` 拼接生成配置响应文件。该文件只支持 GET/HEAD，不包含存储、网络下载或页面处理；它只安装在业务插件的 /configs/{module} 规则中。关闭业务插件后 Mock 消失，独立通用模块继续启用也不会误判该设置入口可用。

以下是包内部处理器接受的安装映射形状；也可供需要手动集成的宿主使用：

~~~js
import { PreferencesHandler } from "@nsnanocat/preference-panes";

const handler = new PreferencesHandler({
  origin: "https://example.org",
  storageKey: "Root",
  module: "Module",
  resources: [
    { pattern: "^/settings/(?:[a-zA-Z0-9_-]+/?)?$", source: "https://example.org/settings/assets/index.html", contentType: "text/html" }
  ]
});
const response = await handler.handle($request);
~~~

资源 pattern 匹配 pathname，下载源必须避开拦截路径。只有命中静态资源的 GET/HEAD 才下载文件；API 由 SettingsHandler 直接处理，读写不会下载 BoxJS。业务插件只保留配置 Mock；页面与 API 安装规则全部属于独立 PreferencePanes 模块。

## BoxJS 兼容

前端接受字段数组、单 app 和 apps 订阅。字段 ID 为 @根.模块.子路径.键；模块归属来自字段 ID，不能用 app 名称推断。

- name/val/type/desc/items：控件标题、默认值、类型、说明和选项。
- boolean/selects/checkboxes/text/textarea/number：支持的控件类型。
- placeholder/rows/autoGrow：输入提示、多行基础行数和自动高度。
- app name/author/desc/descs/repo：纯文本标题、作者、说明和项目链接。
- icon/icons：显式图标优先，原版 icons 为透明/彩色顺序，不是亮暗顺序。
- script：仅保留元数据，不下载或执行。

不执行 BoxJS HTML、脚本、动态字符串 items，不通过 keys 推导额外字段。WebView 使用原生网络与对象访问，不打入 util 的网络、存储或 Lodash polyfill。代理安装的 storageKey/module 应由接入方与 BoxJS 路径保持一致。

## 构建与发布

~~~sh
npm ci --registry=https://registry.npmjs.org/ --@nsnanocat:registry=https://registry.npmjs.org/
npm run build
npm run check
npm run apifox:generate
npm run apifox:check
npm pack --dry-run
~~~

构建生成 dist/preference-panes.mjs、读取宿主参数的 dist/preference-panes.request.js、供托管站点配置的 dist/preference-panes.proxy.js、仅返回配置的 dist/preference-panes.config.js，以及可直接部署的 dist/settings/{index.html,app.mjs,panel.css,home.css}。0.6.0 支持独立模块统一处理多个业务模块，并将配置 Mock 与通用读写安装彻底分开。

[完整接口说明](apifox/guide.md) · [Apifox JSON](apifox/preference-panes.apifox.json) · [同步方式](apifox/README.md) · [发布工作流](.github/RELEASING.md)
