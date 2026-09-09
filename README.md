# @nsnanocat/preference-panes

PreferencePanes 负责具体模块的设置页、共享导航和本地持久化 API。模块页面只接受 BoxJS JSON 与可选 CSS；业务模块自己发布版本对应的 JSON，项目网站维护定制主页、入口探测和主题。

## 通用 API（0.8.0 form 契约）

嵌入的模块页跟随宿主根元素的 `data-theme`（light/dark）和 `--pp-keyboard-height`（CSS 长度），退出时释放观察器。独立页面使用网页自身/系统主题；通用包不再解析 Bilibili 的 User-Agent。

正式表单仅引用 `src/browser/official-styles.json` 中的官方 Hilo 资源地址，不内嵌、镜像或 Mock App 自带 CSS，也不发布样式下载包。目标环境是能解析这些官方资源的 App WebView，普通公网浏览器不提供资源兜底。原有手写开关、行样式和颜色表已删除；BoxJS 动态生成及修改即保存保持不变。

本地验证可运行 `npm run preview -- --override-official`，显式把官方 URL override 到 `test/fixtures/official-styles/`。副本和 SHA-256 只用于测试，不进入 npm 或 Release；不带此参数的预览与生产一样使用官方地址。

宿主可监听 ModuleFrame 的 `confirm` 事件，调用 `preventDefault()` 接管确认框，再以 `event.detail.resolve(boolean)` 或 `reject(error)` 完成。未接管的独立网页使用浏览器对话框；模块离开后到达的确认结果不会继续写入。

宿主也可监听 `notice` 事件，通过 `preventDefault()` 接管 `{kind, message}` 提示；被接管时模块不创建网页 Toast、不启用提示计时器。独立使用的通用面板仍提供默认通知。

设置页顶部使用官方 VField 外观搜索当前字段的名称、说明、路径和选项标签。搜索只隐藏现有行，不重新生成控件、不追加网络读取；文本框、多行输入和下拉框也共用相同字段结构。

业务模块安装同一个 `https://github.com/NSNanoCat/PreferencePanes/releases/latest/download/api.js`，不再生成绑定业务配置的读写脚本，也不需要额外安装独立设置插件。该文件由本仓库 Release 工作流发布，自动更新遵循代理工具的缓存周期。

API 为 POST /api/get、/api/set、/api/delete。form 字段名是完整 `@root.path`；读取和删除的值留空，写入值可以是普通文本或 JSON。API 不鉴权，不下载 JSON，也不校验控件和枚举。

```js
await fetch("/api/set", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams([["@BiliBili.Enhanced.Settings.Home.Top_left", JSON.stringify("mine")]]),
});
```

前端统一 JSON.stringify 再做 form 编码，保留字符串、布尔值、数值、null、数组和对象的区别。API 通过 util Storage/Lodash 读取根、操作目标路径、写回一次；不会在写入后额外读取。缺失键返回 404，写入/删除成功返回 200。旧 /api/{module}/{path} 接口移除。

## 页面与输入

主页状态行使用 `@nsnanocat/preference-panes/navigation` 的 `ModuleStatus`。组件只 HEAD 配置地址，失败显示“未安装”，成功读取 X-PreferencePanes-Version 显示业务模块版本；旧配置未提供版本头时显示“版本未知”。状态行始终占据第二行，不读取持久化设置。

```js
import { mount } from "@nsnanocat/preference-panes/browser";
const page = mount(boxjs, ".pp-panel { --pp-accent: #16866a; }");
page.destroy();
```

支持字段数组、单 app 和仅包含一个模块的 apps 订阅。控件、名称、图标和默认值从 BoxJS 解析；`@Root.Module.Settings.key` 直接给出存储根与键路径，不需要额外映射配置。省略 CSS 使用内置样式。

`/settings/{module}` 由通用 api.js 返回模块文档。页面可通过 json/css 查询参数或 X-PreferencePanes-JSON/CSS Header 指定资源 URL；默认 JSON 是 /configs/{module}，CSS 默认空。Header 分别优先。

```js
import { ModuleFrame, Navigation } from "@nsnanocat/preference-panes/navigation";
const frame = new ModuleFrame("/settings/Module", {
    headers: { "X-PreferencePanes-JSON": "/configs/Module", "X-PreferencePanes-CSS": "/theme.css" },
    signal,
});
container.append(frame.element);
await frame.load();
frame.addEventListener("change", () => { title.textContent = frame.state.title; });
back.onclick = () => frame.back();
frame.destroy();
```

ModuleFrame 在 iframe 元素上保存原请求上下文，HTML 原样加载，不从 about:srcdoc 猜模块、不注入临时 CSS。框架自身管理嵌入模式，通过事件发布标题、忙碌状态和返回能力。Navigation 统一管理 fragment 历史、滑动、滚动保留、加载取消及动画结束后释放；项目提供根页、子页工厂和布局。

每次进入模块读取 JSON/CSS 和设置一次。二级多选返回复用内存缓存，修改立即写入；成功提示、失败回滚由公共组件处理。Caches 按需查看/清空，重置只删除指定模块子树。

模块图标显示在设置表单顶部，标题栏只显示文字；嵌入模式隐藏模块自身标题栏，由宿主显示原生标题或自己的导航。模块数据操作位于标题栏右侧三点菜单，页面不再平铺维护按钮。`ActionMenu` 用于独立网页，也可用于网页宿主；原生宿主可直接把 `frame.state.actions` 映射为平台菜单，通过 `frame.perform(id)` 执行。使用网页菜单时，宿主将 `frame.state.actions` 传给 `menu.update(actions, busy)`，选择时调用 `frame.perform(id)`。缓存查看进入可返回的缓存子页，清空和重置仍要求确认。菜单组件处理外部点击、Escape、方向键与 Tab，宿主不访问 iframe 内部 DOM。

## 构建与验证

`npm run build` 生成无业务配置的 dist/api.js 和公共前端；Release 工作流上传 api.js、index.html、app.mjs、navigation.mjs。`build(boxjs, css?)` 仅用于生成模块前端文件，不再输出配置副本或模块绑定脚本。

`npm run preview` 提供文件导入测试台，上传 JSON/CSS 后在隔离 iframe 预览；测试存储只在内存中。`npm run check` 检查代码、类型、行为；`npm run apifox:generate` 和 `npm run apifox:check` 维护原生接口文档。

[接口规范](apifox/Specification.md) · [Apifox JSON](apifox/preference-panes.apifox.json)
