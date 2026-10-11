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

默认样式随包内置。首页、模块设置和字段子页使用同一文档、同一宿主、菜单和主题。项目 `theme.css` 位于默认样式之后，可覆盖 `pp-*` 变量和组件规则；页面不识别客户端 User-Agent，也不自动加载客户端 SDK。

## 页面与 API

Release 只提供内联程序与默认 CSS 的 `home.html` 网页框架，以及独立代理存储脚本 `api.js`。网站原样复制 `home.html` 为 `/settings/index.html`，或通过 Mock 映射到 `/settings/`。

首页仅以 `HEAD /api/{module}` 探测安装状态和版本。点击入口后才 `GET /api/{module}` 获取 BoxJS JSON，再读取 Settings 并挂载表单。路由为 `/settings/`、`#Universal` 和 `#Universal/<view>`；直接打开字段页会补齐首页和模块返回历史，刷新不重复堆叠。字段子页复用当前会话，切换模块或回到首页结束原会话。前进后退保留各路由滚动位置；页面退出取消读取并忽略迟到响应，已经开始的写入沿原队列完成，退出后不更新界面。

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

设置项支持 `type: "url"` 作为只读跳转入口。它的 `val` 必须是带 scheme 的地址，例如 `bilibili://main/top_category`；面板将其渲染为可点击链接，不会发起存储写入。链接统一交由当前宿主的 `openURL(url)` 处理。

## 固定路径首页与可选 Bridge

Release 的 `home.html` 内置首页程序、导航、默认 CSS 和网页宿主能力。同一文件原样复制为网站 `/settings/index.html`，或通过插件 Mock 映射到 `/settings/`；不替换 HTML 属性、标题或构建信息。

| 相对路径 | 内容 | 行为 |
| --- | --- | --- |
| `./home.json` | 品牌、章节、图标和链接 | 必需，读取并校验 |
| `./theme.css` | 品牌样式 | 可选，HEAD 返回 404 时使用默认样式 |
| `./bridge.mjs` | 已有客户端原生接入 | 可选，HEAD 返回 404 时使用网页功能 |

资源相对于首页 URL 解析。可选资源只有 HEAD 返回 200 才加载；其它状态、网络、加载、语法或初始化错误会显示错误。未提供 Bridge 时使用网页标题栏、返回、ActionMenu、Toast、确认框、系统主题与键盘避让，不导入适配模块、不加载 SDK，也不通过 User-Agent 自动启用 Bridge。

首页 JSON 示例：

```json
{
  "title": "Example",
  "logo": "assets/logo.png",
  "logoText": "Example",
  "logoHref": "/",
  "sections": [
    {"title": "插件", "items": [
      {"name": "Universal", "icon": {"src": "assets/Universal.png"}, "module": "Universal"},
      {"name": "翻译器 API", "icon": {"text": "🔑"}, "module": "API_Translate"}
    ]},
    {"title": "支持与帮助", "layout": "list", "items": [
      {"name": "官方网站", "icon": {"text": "🏠"}, "href": "../", "target": "internal"},
      {"name": "GitHub 组织", "icon": {"text": "🐙"}, "href": "https://github.com/Example", "target": "_blank"}
    ]}
  ],
  "footer": ["设置保存在当前代理工具中。"]
}
```

`title`、`sections` 必需，`logo`、`logoText`、`logoHref`、`footer` 可选。章节包含 `title`、`items` 和可选 `layout`；默认 `grid` 上图标、下文字，小于 500px、500–699px、700px 以上分别为四、六、八列；`list` 纵向排列左图标、右文字与箭头。入口包含 `name`、唯一的 `icon.src` 或 `icon.text`、可选 `description`，并选择 `module` 或 `href`。模块名称唯一；API 面板使用各自 `module` 配置地址；实际存储模块由 BoxJS 字段 ID 推导。相对图片和链接以 JSON 地址解析，文字通过 `textContent` 渲染；入口版本与底部构建信息居中。必须通过 HTTP(S) 打开页面。

导航名称沿用 Rspress 的 `title`、`logo`、`logoText`：`logo` 和 `logoText` 分别在首页导航栏显示品牌图片和文字；两者均未提供时显示 `title`。`title` 同时用于文档和原生导航标题。模块及子页显示当前设置标题。默认网页导航的图标和文字共用一个链接，悬停以 0.3 秒过渡到 60% 不透明度；沿用 Rspress 的可选 `logoHref` 指定目标，相对地址以 JSON 地址解析，省略时跳转到网站首页 `/`。链接保留浏览器的点击、键盘及新标签打开行为。

链接可声明 `target`：`internal` 将 HTTP(S) 页面嵌入现有导航框架，保留标题和返回按钮；`_self` 替换当前整页；`_blank` 在点击时请求新窗口或标签，保留原设置页。省略时沿用原宿主行为，普通浏览器为整页跳转。内部页面不注入项目样式或设置接口，退出时释放 iframe；其导航不能替换顶层设置页。目标站点的 `X-Frame-Options` 或 CSP 可能禁止嵌入，GitHub 组织页和 Discussions 应使用 `_blank`。网页不能保证启动指定外部浏览器；WebView 的新页行为由宿主实现决定。

初始化按 JSON、可选 CSS、可选 Bridge 的顺序进行，完成后创建首页与导航。项目 CSS 位于默认样式之后，同文档表单直接使用该样式。Bridge 默认导出 `BridgeFactory`（类型来自既有 `@nsnanocat/preference-panes/browser`）：

```js
export default async function createBridge({ menu, back }) {
    // 初始化项目自己的 SDK，再返回宿主能力。
    // Initialize the project-owned SDK before returning host capabilities.
    return { update(state) {}, confirm(message) {}, notice(detail) {}, openURL(url, target) {}, destroy() {} };
}
```

`update` 接收 `{title, actions, busy, canGoBack}`；`confirm` 返回 boolean 或 Promise<boolean>；`notice` 接收 `{kind, message}`。`menu` 是共用 ActionMenu，`back` 沿文档历史返回。Bridge 只覆盖宿主能力，不覆盖首页生成、表单或存储；它负责官方 SDK、原生监听器和晚到响应。通用程序负责探测、导航、菜单和会话生命周期，退出后取消请求与监听器，保留浏览器往返缓存恢复。

首页非内部链接调用 `openURL(url, target)`，传入 JSON 中的 `_self` 或 `_blank`，省略的值仍为 `undefined`。`internal` 始终使用共用导航，不交给 Bridge。宿主处理显式 `_blank` 时应保留当前设置页；不支持或原生调用失败时抛出或拒绝，不能悄悄改为整页跳转。模块设置项继续使用原有 `openURL(url)` 调用。

首页源码为 `home.html`、`home.mjs`、`home.d.mts`，首页与设置页共用 `styles.css` 和同一套样式安装逻辑。整页样式只作用于框架 HTML，项目 CSS 在默认样式之后覆盖。首页构建只交付内联 `home.html`，不发布独立首页 JS/CSS 或额外运行时包入口。首页与 Bridge 类型从既有 `/browser` 导出。项目构建将本地预览标记、时间和提交号追加到生成 JSON 的 `footer`，保持共用 HTML 字节不变。网页控件保持 iOS 15 兼容。

BoxJS app 可声明 `cachePath: "@DualSubs.Composite.Caches"`，必须属于相同存储根的模块 Caches 子树；未声明时仍使用当前模块 Caches。查看与清空遵循该路径，共享缓存确认框会说明其它模块受影响。整体重置默认只删除当前模块数据。多个面板共享模块存储时，app 可声明 `resetPaths` 完整路径数组；路径必须位于该模块 Settings 下并覆盖本页面字段。重置逐项删除这些子树，保留其它页面设置和缓存；请求失败会明确报错。

索引字段允许 `Languages[0]` 或 `Languages.0`；同一个数组须声明连续索引及各项默认值。写入或单项恢复会保存完整数组，保留其余项和已有额外元素，不改变固定存储 API 的请求格式。

## 默认导航

网页导航沿用 Rspress 2.0.18 `rp-nav` 的布局和滚动视觉规则，不依赖 React 或官网运行时。全宽导航高 64px 加安全区，左右默认 20px，1280px 以上按 1588px 内容基准增加留白。标题靠左，前方只有返回键；有操作时显示菜单按钮，桌面端也保留。导航始终保留 25px 背景模糊；滚动不足 100px 时背景和分隔线透明，达到 100px 后在 200ms 内渐显为 60% 不透明底色，内容可滚动到导航背后。操作菜单的底部弹层、遮罩、取消、键盘及焦点恢复保持共用实现。原生 Bridge 不创建网页导航，品牌 CSS 和原生 MORE 接入继续由项目维护。

导航排版以 DualSubs 官网为基准：链接使用 Rspress 的 `1rem`／`600`，文字继承链接样式；导航使用官网的 `1.7` 行高、字体栈及渲染规则。`SF Pro Display` 属于官网主题定制，默认 CSS 的 `@font-face` 直接引用同站已有 `/static/font/SFPRODISPLAYBOLD.21a7ca4497.woff2`，不复制或内嵌字体，也不增加发布资产。该文件声明为正常体 `700`，标题保持 `600`，沿用官网的字体匹配。宿主网站须提供对应字体资源；官网改变字体产物地址时须同步更新引用。表单正文排版与原生 Bridge 保持独立。

返回键和分隔线始终显示；没有可返回的历史时禁用返回键，保持 Logo 与标题的位置稳定，避免新标签首次进入和从模块返回后发生水平移动。

## 构建与验证

```sh
npm run build
npm run check
npm run apifox:check
npm pack --dry-run
```

构建生成 `dist/home.html`、`dist/api.js`、`dist/preference-panes.mjs` 和 `dist/navigation.mjs`。包不提供 `web.js`，也不提供按模块生成 HTML/CSS 的公开 `build()`。

单文档改造的浏览器验收覆盖首页 HEAD 探测、点击加载、字段会话复用、直接链接、返回与滚动恢复、语言数组写入、退出后的迟到响应，以及 390／800／1440／1920px 深浅主题和 100px 导航阈值。iOS 18.6 Safari 模拟器已实际加载首页及模块设置；Bilibili SDK 测试替身覆盖原生标题、MORE、主题、键盘与清理，真实 Common WebView 和 iOS 15 设备尚未验收。消费端资源映射须在对应 1.3.x 框架发布后同步上线。

### 内置演示

```sh
npm run preview
```

预览入口会自动加载 `examples/Module.boxjs.json`，覆盖 `boolean`、`selects`、`checkboxes`、`text`、`textarea`、`number` 和 `url` 全部受支持控件。顶端 CSS 选择器默认使用包内置 CSS，也可切换 `examples/theme.css` 或导入本地 CSS 文件。预览服务器直接提供正式构建的 `home.html`，通过固定 `home.json`、`theme.css` 和 `/api/{module}` 提供所选资源，并使用固定存储 API 与独立内存存储，不维护演示专用渲染器。

内置存储会提供已移除选项和格式错误值，用于直接核对字段级黄色警告及非阻断加载；URL 字段还会携带同路径旧存储值，验证只读链接始终使用 BoxJS `val`。测试台同时保留上传其它 BoxJS JSON 并生成隔离预览的能力。

[接口规范](apifox/Specification.md) · [宿主集成](apifox/HostIntegration.md) · [Apifox JSON](apifox/preference-panes.apifox.json)
