# @nsnanocat/preference-panes

PreferencePanes 负责具体模块的设置页、共享导航和本地持久化 API。模块页面只接受 BoxJS JSON 与可选 CSS；业务模块自己发布版本对应的 JSON，项目网站维护定制主页、入口探测和主题。

## 通用 API（0.8.0 form 契约）

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

## 构建与验证

`npm run build` 生成无业务配置的 dist/api.js 和公共前端；Release 工作流上传 api.js、index.html、app.mjs、navigation.mjs。`build(boxjs, css?)` 仅用于生成模块前端文件，不再输出配置副本或模块绑定脚本。

`npm run preview` 提供文件导入测试台，上传 JSON/CSS 后在隔离 iframe 预览；测试存储只在内存中。`npm run check` 检查代码、类型、行为；`npm run apifox:generate` 和 `npm run apifox:check` 维护原生接口文档。

[接口规范](apifox/Specification.md) · [Apifox JSON](apifox/preference-panes.apifox.json)
