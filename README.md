# @nsnanocat/preference-panes

PreferencePanes 提供一个由 BoxJS JSON 驱动的通用设置前端，以及一个独立的代理配置与持久化 API。业务模块只发布自己的 `/configs/{module}`；通用 `/settings/**` 前端和 `/api/**` 后端分别只需要安装一次。

在 Biliverse 中，Enhanced 是唯一安装 `web.js` 的模块。Global、Redirect、ADBlock 不携带 `web.js`，它们的设置页仍由同一份通用前端读取各自 BoxJS 后渲染。

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

默认样式随包内置。嵌入页面只跟随宿主根元素的 `data-theme` 和 `--pp-keyboard-height`，不识别客户端 User-Agent，也不加载项目 CSS 或客户端 SDK。

## 页面与 API

`web.js` 只返回三类通用资源：

- `GET /settings/{module}`
- `GET /settings/assets/index.mjs`
- `GET /settings/assets/navigation.mjs`

模块页面从 URL 或 `ModuleFrame` 的模块标记取得模块名，通过同源 `/api/{module}` 读取原始 BoxJS，然后调用 `mount(boxjs)`。页面不接受 JSON/CSS 查询参数、私有请求头或兼容资源别名，也不直接访问 `/configs/**`。

`api.js` 只处理：

- `HEAD /api/{module}`：探测同源 `/configs/{module}`，透传状态与 `X-PreferencePanes-Version`。
- `GET /api/{module}`：原样返回同源 `/configs/{module}` 的 BoxJS JSON 与版本头。
- `POST /api/get`：读取完整 `@root.path`。
- `POST /api/set`：写入完整 `@root.path`。
- `POST /api/delete`：删除完整 `@root.path` 或子树。

模块 API 只转发业务配置；固定存储 API 不下载或解析 BoxJS。BoxJS 字段、控件、选项、默认值与写入值都由浏览器校验。

```js
await fetch("/api/set", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams([["@BiliBili.Enhanced.Settings.Home.Top_left", JSON.stringify("mine")]]),
});
```

页面初始化时只执行一次 `POST /api/get` 读取 Settings 子树。写入成功后仅更新当前页面快照；查看 Settings/Caches 时按需读取，清空和重置通过 `/api/delete` 完成。

## 宿主集成

```js
import { ModuleFrame, ModuleStatus } from "@nsnanocat/preference-panes/navigation";

const status = new ModuleStatus(statusElement);
await status.check("/api/Module");

const frame = new ModuleFrame("/settings/Module", { signal });
container.append(frame.element);
await frame.load();
```

`ModuleFrame` 只携带模块身份和取消信号。宿主通过 `change`、`confirm`、`notice` 事件同步标题、操作菜单、确认框和提示，不读取或改写 iframe 内部 DOM。项目主页、Bilibili JSBridge、原生导航和视觉样式仍由宿主负责。

## 构建与验证

```sh
npm run build
npm run check
npm run apifox:check
npm pack --dry-run
```

构建生成 `dist/api.js`、`dist/web.js`、`dist/preference-panes.mjs` 和 `dist/module/` 通用页面资源。包不再提供按模块生成 HTML/CSS 的公开 `build()`。

`npm run preview` 启动 JSON 文件导入测试台，使用同一通用页面、同源配置和内存存储验证模块行为。

[接口规范](apifox/Specification.md) · [宿主集成](apifox/HostIntegration.md) · [Apifox JSON](apifox/preference-panes.apifox.json)
