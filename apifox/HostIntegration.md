# 调用方集成：模块容器与页面导航

具体模块设置页只接收 BoxJS JSON 和可选 CSS。PreferencePanes 不提供项目主页，也不绑定任何客户端 SDK；项目可以使用公共网页组件建立自己的入口、探测和导航。

## 项目主页

ModuleStatus 只向模块 API 发送 HEAD。代理 API 再探测配置来源并透传状态与 `X-PreferencePanes-Version`；主页不直接请求 BoxJS Mock。主页的 HTML、状态节点、按钮行为与视觉样式均由项目自己定义。

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
  status.check("/api/Enhanced", { json: "/configs/Enhanced" });
</script>
```

该组件不读取设置、不下载 BoxJS，也不推断项目模块清单。`json` 只作为 API 的配置来源请求头传递。

## 模块页面

页面使用 `/settings/{module}`。页面脚本调用 `GET /api/{module}`，由 API 默认读取 `/configs/{module}`；自定义资源通过 `json`/`css` 查询参数或 `X-PreferencePanes-JSON`/`X-PreferencePanes-CSS` 请求头指定，请求头分别优先。示例中的 module 是变量，不预填某个业务项目。

```js
const frame = new ModuleFrame(`/settings/${module}`, {
  headers: {
    "X-PreferencePanes-JSON": `/configs/${module}`,
    "X-PreferencePanes-CSS": stylesheetURL
  }
});
container.append(frame.element);
await frame.load();
```

## 导航与原生 WebView

- `frame.state` 提供 `title`、`module`、`busy`、`canGoBack` 和 `actions`。宿主从状态生成导航，不读取或改写 iframe 内部 DOM。
- `ActionMenu` 提供可复用的底部操作菜单。宿主把 `frame.state.actions` 传给 `menu.update(actions, busy)`；网页按钮可直接使用组件自带触发器，只有原生三点按钮而没有原生菜单的 WebView 宿主在按钮回调中调用 `menu.open()`。选定后调用 `frame.perform(id)`。状态变化会关闭旧菜单，避免对后来打开的模块执行旧操作。

```js
const menu = new ActionMenu(id => frame.perform(id));
frame.addEventListener("change", () => menu.update(frame.state.actions, frame.state.busy));
nativeMoreButton.onclick = () => menu.open();
```
- `confirm` 事件可由宿主 `preventDefault()` 后通过 `detail.resolve(boolean)`/`reject(error)` 完成；未接管时使用标准浏览器确认。
- `notice` 事件包含 `{kind, message}`。宿主接管时负责短暂提示；模块不再创建重复 Toast，也不追加读取。
- BoxJS 获取、字段路径映射和持久化读写全部由模块 API 完成；Web 只规范化、校验和渲染 API 模型。
- 保存成功只更新当前页面快照；每次重新进入模块再通过 API 读取，二级页面返回继续复用现有快照。

客户端 Bridge 属于项目页面的运行环境。项目 HTML 引入客户端的官方 SDK 后，由项目自己的页面脚本直接调用 SDK；不要把某个客户端的 Bridge、User-Agent、主题值或原生菜单协议加入 PreferencePanes。ModuleFrame 的标准事件是双方唯一的网页边界。

当前验证覆盖模块请求、事件时序、过期操作保护和客户端资源隔离。客户端原生界面与项目 CSS 由各项目在对应 App 中验证。
