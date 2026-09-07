# @nsnanocat/preference-panes

尚未发布的通用设置面板和代理存储 API，基于 `@nsnanocat/util`。字段直接来自运行时加载的 BoxJS JSON，页面、缓存与读写逻辑不包含具体项目的选项。

## 工作方式

| 操作 | 网络请求 | 页面缓存 |
| --- | --- | --- |
| 进入主菜单 | 并发 HEAD `/api/<模块>/` | 不读取持久化设置 |
| 打开、再次进入或刷新模块页 | GET 模块 BoxJS，再 GET 声明字段的公共子树，各一次 | 建立新的内存会话，替换旧值 |
| 修改单值 | POST 对应键路径，正文为 JSON 值本身 | 仅 HTTP 200 后更新该键 |
| 删除单值 | DELETE 对应键路径 | 仅 HTTP 200 后移除覆盖值，显示 BoxJS 默认值 |
| 保存、删除后 | 不追加 GET | 成功或失败显示临时通知 |

只有 `/api/` 是固定前缀。`@BiliBili.Enhanced.Settings.Home.Top_left` 映射为 `/api/Enhanced/Settings/Home/Top_left`；`BiliBili` 从 BoxJS ID 解析，不经浏览器 header 传递。

模块根 `/api/Enhanced/` 由模块的配置 Mock 提供 HEAD/GET。该路径不部署公网静态文件；关闭模块后，页面以 HEAD 非 200 或请求失败判为不可用。配置下载源是另一个资源地址。公共 HTML 外壳、JS、CSS 可以在线托管后由代理 Mock 提供，选项由浏览器实时生成。

## 浏览器组件

```js
import { mountPreferencePanes } from "@nsnanocat/preference-panes/browser";
import "@nsnanocat/preference-panes/browser/panel.css";

const panel = mountPreferencePanes({
  element: document.querySelector("#preferences"),
  title: "Preferences"
});
// 卸载时 panel.destroy()
```

同一份 HTML 使用 URL 查询参数选择配置：

```text
/settings/?module=Enhanced → GET /api/Enhanced/
/settings/?module=Global   → GET /api/Global/
```

`module` 是配置命名空间，也就是 `/api/` 后的第一段；它必须与 BoxJS ID 中存储根后的段一致，例如 `@BiliBili.Enhanced.Settings.…` 中的 Enhanced。它不是代理模块的文件名、脚本名或 BoxJS 下载地址。HTML 和通用 JS 不包含业务模块目录，不接收 modules 参数。缺少、重复或非法 module 会显示错误，不请求设置。前进、后退恢复以及刷新时，页面根据当前 URL 重新读取；没有旧 hash 模块路由。

业务主菜单由调用项目维护（Biliverse 由 Enhanced 负责），通过通用 client.probe 并发 HEAD 检测各入口，再打开相应带 module 参数的链接。通用设置页只负责一个 URL 所指定模块的设置；已有单页业务导航也可以挂载/卸载组件，无需复制表单实现。

页面根据 BoxJS 生成表单、校验值并读写。每次重新进入模块都会读取，不使用 localStorage/sessionStorage。默认 CSS 是独立的通用样式，可由调用方替换；本包不依赖 Bilibili CSS 或页面框架。

| 地址示例 | 谁响应 | 内容来源 |
| --- | --- | --- |
| `/settings/?module=Enhanced` | 公共 HTML Mock | 同一份通用 HTML、JS、CSS |
| `/api/Enhanced/` | Enhanced 自己的配置 Mock | Enhanced argument config 经原有生成器生成的 BoxJS JSON |
| `/api/Enhanced/Settings/` | 通用代理脚本 | 读取 util 持久化设置，返回公开子树 |
| `/api/Enhanced/Settings/Home/Top_left` | 同一通用代理脚本 | 单键 GET/POST/DELETE |

根 `/api/Enhanced/` 不交给读写脚本。模块模板分别配置根路径 Mock 和子路径脚本规则；通用脚本的 configURL 与 Mock 引用同一个 BoxJS 资源。页面通过 module 找 Mock，代理通过 configURL 找校验配置，这两个参数用途不同。业务 BoxJS 由业务仓库生成；PreferencePanes 的构建只产出通用 JS，不生成业务配置。

已有 UI 可只用 `createPreferencesClient({ fetch, notify })`：`probe/open/snapshot/set/remove/leave` 共用相同缓存与请求逻辑。`snapshot` 返回副本，`notify` 收到 success/error、write/delete、module、key 和错误 message。请求超时默认 10 秒；HTTP 204 也视为操作失败。

## 代理读写组件

```js
import { createSettingsHandler } from "@nsnanocat/preference-panes";
import { fetch } from "@nsnanocat/util/polyfill/fetch";

const handle = createSettingsHandler({
  origin: "https://example.org",
  loadConfig: async module => {
    const response = await fetch(`https://assets.example.org/${module}.boxjs.json`);
    if (response.status !== 200) throw new Error(`BoxJS HTTP ${response.status}`);
    return JSON.parse(response.body);
  }
});
const response = await handle($request);
// 接入现有平台的 done 适配；或直接使用下述打包入口。
```

每个支持面板的模块都携带自己的配置 Mock，并引用同一个通用读写脚本。脚本正则只匹配各自 `/api/<模块>/<键路径>`，不接管模块根，避免互相覆盖安装探测。处理器每次键值请求运行时加载配置，仅允许操作已声明的字段。

持久化 GET 调用一次 util `Storage.getItem`；POST/DELETE 在写入前重新读取最新根对象，再用 util `Lodash.set/unset` 修改单键并 `Storage.setItem` 写回，保留其它模块、隐藏字段和缓存。这是代理端必要的读改写，浏览器不会因此重新 GET 整个模块。多个独立脚本上下文同时写同一根键仍受代理存储无事务能力的限制。

`resolveSettings(stored, definition)` 是可选的 GET 解析器，用来按模块既有规则合并 database、argument、持久化值。默认只返回持久化覆盖值，控件缺值时使用 BoxJS `val`。本包不修改插件原有的配置优先级；删除后不重新计算 resolver，而是在下次进入/刷新时重新读取。

## BoxJS 范围

支持 settings 数组、单个 app 的 `settings`、订阅的 `apps[].settings`；控件类型支持 boolean、selects、checkboxes、text、textarea、number。不执行 BoxJS 脚本或 HTML。

设置 ID 必须为 `@存储根.模块.子路径.键`。同一模块使用一个存储根，字段路径不得重复或父子重叠。为了用一次 GET 获取设置，字段必须具有模块根以下的公共父路径，例如 `Enhanced.Settings` 或 `Weather.Preferences`；公共路径自动计算，不固定为 Settings。不满足条件或遇到不支持的控件会报错。

## 打包与示例

```sh
npm ci --registry=https://registry.npmjs.org/ --@nsnanocat:registry=https://registry.npmjs.org/
npm run build
npm run check
npm run apifox:generate
node scripts/generate-apifox.mjs --check
npm pack --dry-run
```

构建生成可直接加载的 `dist/preference-panes.mjs` 和代理 IIFE `dist/preference-panes.request.js`，公共样式位于 `browser/panel.css`。代理包包括 util 的平台适配和 `@nsnanocat/url`，不依赖 Node 内置模块。

[Surge 模板](examples/surge.sgmodule)使用原生 Map Local 提供静态资源，http-request 提供持久化 API。模板中的域名均为占位，尚未部署；需要把源码资源和 dist 产物发布到自己的资源地址。其 `argument` 只配置 `origin` 和 `configURL`，不会固化字段。Map Local 下载缓存的更新时机由代理管理；浏览器 no-store 不会强制 Surge 更新资源缓存。配置 Mock 与脚本 configURL 应引用同一版本的 BoxJS。

Quantumult X 等不能通过模板传递 `$argument` 的平台，需要在构建入口注入这两个地址参数，再打包同一通用执行端；本仓库没有声称该 Surge 模板可直接安装到其它代理。隔离测试覆盖 Surge/QX 宿主 API，尚未在用户设备上安装验收。

## 接口文档与发布

- [完整请求、返回与缓存时序说明](apifox/guide.md)
- [Apifox 原生 JSON](apifox/preference-panes.apifox.json)
- [Apifox 项目](https://app.apifox.com/project/8803052)、[Git 数据源绑定记录](apifox/sync.md)

main/dev 普通推送只触发 CI；已有两套 v* tag workflow 分别发布 npm 与 GitHub Packages。本轮只准备源码、测试和文档，不发布 package、不推送 tag，不迁移 Biliverse 消费端。首次发布和权限配置仍待评审确认。
