# @nsnanocat/preference-panes

PreferencePanes 负责具体模块的设置页、共享网页组件和本地持久化 API。模块页面只接受 BoxJS JSON 与可选 CSS；业务模块自己发布版本对应的 JSON。项目主页及其客户端 SDK 调用属于调用方，不进入本包。

## 通用 API（0.8.0 form 契约）

嵌入的模块页跟随宿主根元素的 `data-theme`（light/dark）和 `--pp-keyboard-height`（CSS 长度），退出时释放观察器。独立页面使用网页自身或系统主题；通用包不识别任何客户端 User-Agent。

默认样式完全由包内 `pp-*` 类和 CSS 变量提供，不请求任何项目或客户端资源。调用方可通过 CSS 输入覆盖变量、组件，或在该 CSS 中自行引用所属客户端的官方样式。开关采用标准 checkbox 的 switch 属性及 switch 语义，由浏览器呈现原生控件（[Safari/iOS 17.4 起显示开关](https://webkit.org/blog/15054/an-html-switch-control/)，其他浏览器保留可操作的复选框）；单选使用 select，多选保留二级页面。BoxJS 动态生成及修改即保存保持不变。

宿主可监听 ModuleFrame 的 `confirm` 事件，调用 `preventDefault()` 接管确认框，再以 `event.detail.resolve(boolean)` 或 `reject(error)` 完成。未接管的独立网页使用浏览器对话框；模块离开后到达的确认结果不会继续写入。

宿主也可监听 `notice` 事件，通过 `preventDefault()` 接管 `{kind, message}` 提示；被接管时模块不创建网页 Toast、不启用提示计时器。独立使用的通用面板仍提供默认通知。

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

项目主页可按需使用导出的 ModuleStatus、ModuleFrame 和 Navigation，也可以自行实现入口。PreferencePanes 不提供主页运行脚本，不识别具体 App，不加载或调用任何客户端 Bridge SDK。调用方若运行在原生 WebView，应在自己的 HTML/页面脚本中直接接入该客户端的官方 SDK，再把 ModuleFrame 事件映射到原生界面。

每次进入模块读取 JSON/CSS 和设置一次。二级多选返回复用内存缓存，修改立即写入；成功提示、失败回滚由公共组件处理。Caches 按需查看/清空，重置只删除指定模块子树。

标题栏只显示文字；嵌入模式隐藏模块自身标题栏，由宿主显示原生标题或自己的导航。模块数据操作位于标题栏右侧三点菜单，页面不再平铺维护按钮。`ActionMenu` 是共用的底部操作菜单：独立网页由其三点按钮打开；网页宿主或只有原生按钮、没有原生菜单的 WebView 宿主，将 `frame.state.actions` 传给 `menu.update(actions, busy)`，在宿主按钮点击时调用 `menu.open()`，选择后调用 `frame.perform(id)`。查看设置和缓存都会通过 `POST /api/get` 按需读取最新子树，再进入可返回的 JSON 详情子页；返回详情页不会触发额外读取，清空和重置设置仍要求确认。菜单组件提供遮罩、取消按钮、外部点击、Escape 与方向键操作，弹层挂载在文档根部，不依赖模块标题栏是否显示；宿主不访问 iframe 内部 DOM。

## 构建与验证

`npm run build` 生成无业务配置的 dist/api.js 和公共前端；Release 工作流只上传包含页面与运行资源的 api.js。`build(boxjs, css?)` 仅输出 `settings/{module}/index.html`、公共 `settings/assets/app.mjs` 和可选模块 CSS，不复制配置、导航组件或重复 HTML。

`npm run preview` 提供文件导入测试台，上传 JSON/CSS 后在隔离 iframe 预览；测试存储只在内存中。`npm run check` 检查代码、类型、行为；`npm run apifox:generate` 和 `npm run apifox:check` 维护原生接口文档。

[接口规范](apifox/Specification.md) · [Apifox JSON](apifox/preference-panes.apifox.json)
