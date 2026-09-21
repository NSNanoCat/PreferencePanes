# 调用方集成：模块容器与页面导航

PreferencePanes 不提供项目主页，也不绑定客户端 SDK。宿主负责模块列表、主题、原生导航、确认、提示、项目 stylesheet 与客户端 Bridge；通用设置页仍只把 BoxJS JSON 交给 `mount(boxjs)`。

## 项目主页

`ModuleStatus` 只向模块 API 发送 HEAD。业务模块模板直接返回状态与 `X-PreferencePanes-Version`；只有状态为 200 且版本头非空时才判定已安装。

```html
<button id="module" disabled>
    <img src="/settings/assets/Enhanced.png" alt="">
    <span>Enhanced</span>
    <span id="status">检测中</span>
</button>
<script type="module">
    import { ModuleStatus } from "@nsnanocat/preference-panes/navigation";
    const status = new ModuleStatus(document.querySelector("#status"));
    status.addEventListener("change", () => module.disabled = status.state.status !== "installed");
    status.check("/api/Enhanced");
</script>
```

主页不读取设置、不下载 BoxJS，也不推断模块清单。

## 模块页面

`ModuleFrame` 只打开映射到静态 `index.html` 的规范 `/settings/{module}` 页面并标记模块身份。调用方可用现有 Header 选项声明 BoxJS 与项目 stylesheet 资源；这些值经校验后写入 iframe dataset，不会作为网络 Header 发送。未提供 JSON 输入时页面默认读取同源 `/api/{module}`。页面不直接访问 `/configs/**`，除非调用方明确将该地址作为 JSON 资源输入。

```js
const frame = new ModuleFrame(`/settings/${module}`, {
    signal,
    headers: {
        "X-PreferencePanes-JSON": "https://example.org/Module.boxjs.json",
        "X-PreferencePanes-CSS": "https://example.org/theme.css",
    },
});
container.append(frame.element);
await frame.load();
```

`ModuleFrame` 的选项类型是 `{ signal?: AbortSignal; headers?: HeadersInit }`。它只发送不带自定义 Header 的 GET，将静态 HTML 原样交给 `srcdoc`，并把合法 HTTP(S) BoxJS/CSS 地址写入 iframe dataset。`frame.state` 提供 `title`、`module`、`busy`、`canGoBack` 和 `actions`。宿主从状态生成导航，不访问 iframe 内部 DOM。

## 导航与原生 WebView

`ActionMenu` 可复用模块公开的操作列表：

```js
const menu = new ActionMenu(id => frame.perform(id));
frame.addEventListener("change", () => menu.update(frame.state.actions, frame.state.busy));
nativeMoreButton.onclick = () => menu.open();
```

- `confirm` 事件可由宿主 `preventDefault()` 后通过 `detail.resolve(boolean)` 或 `reject(error)` 完成；未接管时使用浏览器确认。
- `notice` 事件包含 `{kind, message}`。宿主接管后负责提示；模块不再创建重复 Toast。
- 保存成功只更新当前页面快照；重新进入模块时重新读取 BoxJS 和 Settings。
- 通用前端与固定存储 API 规则由一个宿主模块分别提供；业务模块只安装自己的 `/api/{module}` BoxJS Mock。

客户端 Bridge 属于项目页面。项目 HTML 引入官方 SDK 后，由自己的页面脚本直接调用，再将 `ModuleFrame` 事件映射到原生界面。不要把具体客户端的 Bridge、User-Agent、主题值或原生菜单协议加入 PreferencePanes。
