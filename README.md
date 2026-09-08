# @nsnanocat/preference-panes

通用设置面板和代理存储 API，基于 `@nsnanocat/util`，首版 `0.1.0` 已发布到 npm 和 GitHub Packages。字段直接来自运行时加载的 BoxJS JSON，页面、缓存与读写逻辑不包含具体项目的选项。

## 工作方式

| 操作 | 网络请求 | 页面缓存 |
| --- | --- | --- |
| 进入主菜单 | 并发 HEAD `/configs/<模块>` | 不读取持久化设置 |
| 打开、再次进入或刷新模块页 | GET 模块 BoxJS，再 GET 声明字段的公共子树，各一次 | 建立新的内存会话，替换旧值 |
| 修改单值 | POST 对应键路径，正文为 JSON 值本身 | 仅 HTTP 200 后更新该键 |
| 删除单值 | DELETE 对应键路径 | 仅 HTTP 200 后移除覆盖值，显示 BoxJS 默认值 |
| 保存、删除后 | 不追加 GET | 成功或失败显示临时通知 |

只有 `/api/` 是固定前缀。`@BiliBili.Enhanced.Settings.Home.Top_left` 映射为 `/api/Enhanced/Settings/Home/Top_left`；`BiliBili` 从 BoxJS ID 解析，不经浏览器 header 传递。

配置资源与数据接口使用不同前缀：`/configs/Enhanced` 是 BoxJS Mock，`/api/Enhanced/…` 是持久化 API。配置 Mock 地址不部署同名线上文件，关闭模块后 HEAD 非 200 或失败即禁用入口；它的下载源可以是另一个在线资源地址。公共 HTML、JS、CSS 可以在线托管后由代理 Mock 提供，选项由浏览器实时生成。

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

同一份 HTML 从 `/settings/{module}` 路径读取模块标识，按固定约定读取配置：

```text
/settings/Enhanced → GET /configs/Enhanced
/settings/Global   → GET /configs/Global
```

不需要查询参数。路径中的 module 既决定配置 Mock 路径，也选择 BoxJS ID 中对应模块的字段，例如 `@BiliBili.Enhanced.Settings.…` 中的 Enhanced。配置文件的实际下载地址由模块模板中的 Mock 规则指定，不写入 HTML 或页面 URL。HTML 和通用 JS 不包含业务模块目录。

| 地址 | 谁响应 | 内容 |
| --- | --- | --- |
| `/settings/Enhanced` | 公共 HTML Mock | 通用设置页面 |
| `/configs/Enhanced` | Enhanced 的配置 Mock | argument config 经原有生成器生成的 BoxJS JSON |
| `/api/Enhanced/` 或 `/api/Enhanced/Settings/` | 通用读写脚本 | 已声明字段的持久化子树 |
| `/api/Enhanced/Settings/Home/Top_left` | 同一个通用读写脚本 | 单键 GET/POST/DELETE |

模块模板的配置规则只匹配 `/configs/…`，脚本规则只匹配 `/api/…`，两者没有交集，不依赖命中先后顺序。代理脚本自己的 configURL 参数由模块模板提供，指向与 Mock 相同版本的 BoxJS 下载源，用于写入校验；该 configURL 是代理脚本的模块模板参数，不是页面参数。

业务主菜单由调用项目维护（Biliverse 由 Enhanced 负责），每次进入通过 `client.probe(module)` 并发 HEAD `/configs/{module}`，再打开 `/settings/模块标识`。HEAD 只检测配置 Mock 可用性，不读取存储。

通用设置页每次进入、刷新或浏览器缓存恢复时，用 `client.open(module)` GET `/configs/{module}` 一次，再 GET 持久化子树一次。用配置实时生成表单，值放在内存，不使用 localStorage/sessionStorage。保存/删除仅 HTTP 200 后更新缓存和通知，不追加 GET。现有 UI 可直接使用同一客户端的 snapshot/set/remove/leave；snapshot 返回副本。

默认 CSS 是独立的通用样式，可由调用方替换；本包不依赖 Bilibili 样式或框架。字段定义由 BoxJS 决定，通用 JS 只定义每类控件如何绘制，不编入各项目的具体选项。

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

每个支持面板的模块都携带自己的配置 Mock，并引用同一个通用读写脚本。脚本正则只匹配各自 `/api/<模块>` 的数据路径，配置 Mock 则只匹配 `/configs/`。处理器每次键值请求运行时加载配置，仅允许操作已声明的字段。

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

main/dev 普通推送与手动 CI 只验证并生成候选 tgz；两套 v* tag workflow 分别发布 npm 与 GitHub Packages。首版为 `0.1.0`，发布步骤与 Trusted Publisher 配置见 [RELEASING.md](RELEASING.md)。Enhanced 通过 GitHub Packages 安装正式依赖，lockfile 使用 registry 下载地址。
