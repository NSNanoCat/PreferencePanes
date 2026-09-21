# @nsnanocat/preference-panes

PreferencePanes 提供一个由 BoxJS JSON 驱动的通用设置前端，以及一个独立的代理持久化 API。业务模块直接将自己的 BoxJS JSON Mock 到 `/api/{module}`；通用 `/settings/**` 前端和固定存储 API 分别只需要安装一次。

在 Biliverse 中，Enhanced 统一映射 PreferencePanes 发布的静态模块 HTML、页面入口和导航组件。Global、Redirect、ADBlock 不重复携带页面资源，它们的设置页仍由同一份通用前端读取各自 BoxJS 后渲染。

## 浏览器入口

浏览器包只公开一个入口：

```ts
function mount(boxjs: BoxJSInput): MountedPreferences;
interface MountedPreferences { destroy(): void }
```

```js
import { mount } from "@nsnanocat/preference-panes/browser";

const boxjs = await fetch("/api/Module", {
    cache: "no-store",
    credentials: "omit",
}).then(response => response.json());

const preferences = mount(boxjs);
preferences.destroy();
```

`mount()` 同步建立页面生命周期。BoxJS 规范化、默认值、已存值校验、加载状态和失败重试都由内部流程管理；不公开 API Model、视图 class、构建器或 CSS 第二参数。

前端支持 BoxJS 字段数组、单个 app 和 apps 订阅，并要求输入恰好包含一个模块。模块名、存储根和 Settings 路径都从 `@Root.Module.Settings.key` 字段 ID 推导，不从 app 名称或调用参数补充。

默认样式随包内置。静态模块页接受 `json`、`css` 查询参数；嵌入 `ModuleFrame` 时也可通过 `X-PreferencePanes-JSON`、`X-PreferencePanes-CSS` 选项传入两个资源 URL。未指定 JSON 时默认读取 `/api/{module}`，未指定 CSS 时只使用默认样式。项目 stylesheet 位于默认样式之后，可覆盖 `pp-*` 变量和组件规则。页面脚本不识别客户端 User-Agent，也不加载客户端 SDK。

## 页面与 API

Release 分别提供三项可直接映射的页面资源：

- `GET /settings/{module}`
- `GET /settings/assets/index.mjs`
- `GET /settings/assets/navigation.mjs`

模块 HTML、页面入口和导航组件分别对应 Release 的 `index.html`、`index.mjs`、`navigation.mjs`，不得再打包进代理响应脚本。模块页面从 URL 或 `ModuleFrame` 的模块标记取得模块名，读取 BoxJS 资源后调用 `mount(boxjs)`。BoxJS 与可选 CSS 地址必须解析为 HTTP(S)；未声明 BoxJS 时回退同源 `/api/{module}`，页面不直接访问 `/configs/**`。

业务模块模板直接处理：

- `HEAD /api/{module}`：返回空正文和 `X-PreferencePanes-Version`。
- `GET /api/{module}`：返回同版原始 BoxJS JSON。

`api.js` 只处理：

- `POST /api/get`：读取完整 `@root.path`。
- `POST /api/set`：写入完整 `@root.path`。
- `POST /api/delete`：删除完整 `@root.path` 或子树。

模块名 `get`、`set` 和 `delete` 为固定存储端点保留。模块 API 与固定存储 API 都不解析 BoxJS；BoxJS 字段、控件、选项、默认值与写入值全部由浏览器校验。

```js
await fetch("/api/set", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams([["@BiliBili.Enhanced.Settings.Home.Top_left", JSON.stringify("mine")]]),
});
```

页面初始化时只执行一次 `POST /api/get` 读取 Settings 子树。外部存储中的历史值不会阻断页面加载：当前选项表未定义的值会保留并在对应设置项下提示，无法由控件表示的值会回退到默认值并显示警告；用户的新写入仍执行严格校验。写入成功后仅更新当前页面快照；查看 Settings/Caches 时按需读取，清空和重置通过 `/api/delete` 完成。

设置项支持 `type: "url"` 作为只读跳转入口。它的 `val` 必须是带 scheme 的地址，例如 `bilibili://main/top_category`；面板将其渲染为可点击链接，不会发起存储写入。嵌入 `ModuleFrame` 时，宿主可拦截 `open-url` 事件（`detail.url`）并打开链接；未拦截或独立网页中保留链接的默认导航。

## 宿主集成

```js
import { ModuleFrame, ModuleStatus } from "@nsnanocat/preference-panes/navigation";

const status = new ModuleStatus(statusElement);
await status.check("/api/Module");

const frame = new ModuleFrame("/settings/Module", {
    signal,
    headers: {
        "X-PreferencePanes-JSON": "https://example.org/Module.boxjs.json",
        "X-PreferencePanes-CSS": "https://example.org/theme.css",
    },
});
container.append(frame.element);
await frame.load();
```

`ModuleFrame` 接受 `{ signal?: AbortSignal; headers?: HeadersInit }`。`X-PreferencePanes-JSON` 与 `X-PreferencePanes-CSS` 只用于校验并写入 iframe 数据属性，不作为网络请求 Header；静态 HTML 仍以普通 GET 获取并原样设置为 `iframe.srcdoc`。宿主通过 `change`、`confirm`、`notice`、`open-url` 事件同步标题、操作菜单、确认框、提示和链接跳转，不读取或改写 iframe 内部 DOM。项目主页、Bilibili JSBridge、原生导航和视觉样式仍由宿主负责。

## 构建与验证

```sh
npm run build
npm run check
npm run apifox:check
npm pack --dry-run
```

构建生成 `dist/api.js`、`dist/preference-panes.mjs` 和 `dist/module/index.html`、`index.mjs`、`navigation.mjs`。包不提供 `web.js`，也不提供按模块生成 HTML/CSS 的公开 `build()`。

### 内置演示

```sh
npm run preview
```

预览入口会自动加载 `examples/Module.boxjs.json`，覆盖 `boolean`、`selects`、`checkboxes`、`text`、`textarea`、`number` 和 `url` 全部受支持控件。顶端 CSS 选择器默认使用包内置 CSS，也可切换 `examples/theme.css` 或导入本地 CSS 文件。预览服务器直接提供正式构建的静态模块页和 JS 文件，通过 `json`、`css` 查询参数传入资源地址，并使用固定存储 API 与独立内存存储，不维护演示专用渲染器。

内置存储会提供已移除选项和格式错误值，用于直接核对字段级黄色警告及非阻断加载；URL 字段还会携带同路径旧存储值，验证只读链接始终使用 BoxJS `val`。测试台同时保留上传其它 BoxJS JSON 并生成隔离预览的能力。

[接口规范](apifox/Specification.md) · [宿主集成](apifox/HostIntegration.md) · [Apifox JSON](apifox/preference-panes.apifox.json)
