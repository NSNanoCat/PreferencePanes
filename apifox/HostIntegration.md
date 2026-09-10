# 宿主集成：声明式主页、原生界面与固定搜索

具体模块设置页只接收 BoxJS JSON 和可选 CSS。项目主页只声明入口和素材，PreferencePanes 的通用宿主控制器负责探测、导航及原生交互；HTML 直接引用 Bilibili 官方 SDK 和官方页面 CSS。

## 声明式主页

主页加载 `/settings/assets/host.mjs`，入口按钮至少提供 `data-module`、`data-page`、`data-json`，需要个性化模块页时再提供 `data-css`。状态节点使用 `data-module-status`。HTML 不编写 HEAD、版本解析、iframe 或 Bridge 调用。

```html
<button data-module="Enhanced" data-page="/settings/Enhanced" data-json="/configs/Enhanced" data-css="https://example.org/theme.css" disabled>
  <img src="/settings/assets/Enhanced.png" alt="">
  <span>Enhanced</span>
  <span data-module-status>检测中</span>
</button>
<script src="https://s1.hdslb.com/bfs/seed/jinkela/short/jsb/js-bridge.min.js"></script>
<script type="module" src="/settings/assets/host.mjs"></script>
```

项目 HTML 负责选择官方 SDK 和业务页面 CSS 的地址；`host.mjs` 不镜像官方资源，也不为公网浏览器提供降级页面。

## 模块页面

页面使用 `/settings/{module}`，默认读取 `/configs/{module}`。自定义资源通过 `json`/`css` 查询参数或 `X-PreferencePanes-JSON`/`X-PreferencePanes-CSS` 请求头指定，请求头分别优先。示例中的 module 是变量，不预填某个业务项目。

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

## 导航与原生交互

- `frame.state` 提供 `title`、`module`、`busy`、`canGoBack` 和 `actions`。宿主从状态生成导航，不读取或改写 iframe 内部 DOM。
- 菜单先展示 actions 的 label，选定后调用 `frame.perform(id)`。异步菜单返回时应确认模块没有变化，避免对后来打开的模块执行旧操作。
- `confirm` 事件可由宿主 `preventDefault()` 后通过 `detail.resolve(boolean)`/`reject(error)` 完成；未接管时使用标准浏览器确认。
- `notice` 事件包含 `{kind, message}`。宿主接管时负责短暂提示；模块不再创建重复 Toast，也不追加读取。
- 保存成功只更新当前页面快照；每次重新进入模块再读取，二级页面返回继续复用现有快照。

## 固定搜索

搜索输入位于导航下方的固定工具区，工具区和滚动视口使用弹性布局。滚动表单不会改变输入框的位置；二级多选和缓存页隐藏搜索，返回时恢复原查询。搜索仅过滤当前已生成的字段，不发额外存储请求。

## Bilibili common 容器示例

通用宿主控制器直接使用这些接口。用户已导出 SDK 3.3.5、`container.common: true`。iOS 宿主入口为 `bilibili://web/general?url=<编码后的页面 URL>`。

- 主题：按官方 H5 的实现从 User-Agent `themeId/2` 建立初始深色主题，再订阅 `ui.observeThemeChange` 的 V2 channel；处理 `data.theme`，忽略没有主题数据的注册回执。
- 提示：`liveUI.toast`，数据 `{type:"short", msg:message}`。当前 common 清单没有旧 `biliapp.showToast`。
- 菜单：`ui.setNavigationButton` 创建 MORE 按钮；收到该按钮 ID 后调用 `liveUI.selectPanel`。选项为 `{text:label, value:id}`，返回的 `data.text` 实际是选项 value。
- 原生导航模型没有搜索输入槽位，所以固定搜索仍是模块工具区，不伪造另一套标题栏。

完整原生协议与研究位于 Apifox 的 Bilibili 项目（8774015）：文档「Bilibili Common WebView 调研」（9430864）和「Bilibili Common WebView JSBridge 接口」（9430865）；对应源文件在 Biliverse/API 的 reports 与 docs/reference 中。

当前验证覆盖请求和回调时序、过期操作保护、浏览器中的固定搜索与真实官方 CSS。原生主题事件、底部面板和短提示的最终视觉结果仍需用户真机复测。
