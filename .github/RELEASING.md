# PreferencePanes 发布流程

## 1.2.5

删除代理侧 `web.js` 与内嵌页面资源表。模块 HTML、页面入口和导航组件改为 Release 中独立的 `index.html`、`index.mjs`、`navigation.mjs`，由消费方逐文件映射；`ModuleFrame` 在 iframe 本地传递 BoxJS/CSS 资源输入，只有固定存储接口继续执行 `api.js`。

## 1.2.4

动态模块页面统一支持 BoxJS JSON 与项目 CSS 资源输入：`X-PreferencePanes-JSON`、`X-PreferencePanes-CSS` Header 分别优先于 `json`、`css` 查询参数，未指定 JSON 时继续使用 `/api/{module}`。内置全类型演示默认使用包内 CSS，并可切换示例 CSS 或导入本地 CSS。

## 1.2.3

存储读取改为字段级弱校验：历史未定义选项和格式不兼容值不再阻断整个页面，而是在所属设置项下显示警告；新写入继续严格校验。只读 URL 控件始终使用 BoxJS 声明值，不读取同路径旧存储。

## 1.2.2

URL 设置项保留标准链接导航，并在嵌入 `ModuleFrame` 时提供可取消的 `open-url` 宿主事件，使传统 H5/WebView 与客户端原生导航适配器共用同一控件。

## 1.2.1

BoxJS 设置项支持 `type: "url"` 作为只读 URL Scheme 跳转入口，例如 `bilibili://main/top_category`。

## 1.2.0

动态模块 HTML 支持通过 `css` 查询参数或 `X-PreferencePanes-CSS` Header 加载项目 stylesheet。Header 优先，空 Header 可禁用查询参数；`ModuleFrame` 只转发 GET Header 并原样挂载返回 HTML。

## 1.1.4

嵌入模块不再创建网页标题栏和操作菜单，导航栏由宿主统一提供；独立设置页继续保留 PreferencePanes 自有导航栏。

## 1.1.3

1.1.3 删除无效的模块配置转发。业务模块直接将同版 BoxJS JSON Mock 到 `HEAD/GET /api/{module}` 并配置版本头；PreferencePanes `api.js` 只保留 `POST /api/get|set|delete` 的单字段 form 存储协议。

## 发布前验证

在要发布的提交上运行：

```sh
npm ci --registry=https://registry.npmjs.org/ --@nsnanocat:registry=https://registry.npmjs.org/
npm run build
npm run check
npm run apifox:check
npm pack --dry-run
```

必须确认：

- 根包没有运行时导出，browser 包只导出 `mount`。
- `dist/api.js` 只提供通用 Storage 深路径读写，不包含网络 transport、`/configs/` 或模块路由。
- 浏览器只请求页面声明的 BoxJS 资源；静态页面未声明时回退 `/api/{module}`，且不存在 `/api/{module}/{action}`。
- `/settings/{module}`、`/settings/assets/index.mjs`、`/settings/assets/navigation.mjs` 分别映射 `index.html`、`index.mjs`、`navigation.mjs`，不存在 `web.js`。
- `ModuleFrame` 只用普通 GET 获取静态 HTML，并将合法 HTTP(S) BoxJS/CSS 资源地址写入 iframe 数据属性；`mount(boxjs, css)` 继续为类型错误。
- 内置演示覆盖全部设置项，默认使用包内 CSS，并可切换示例 CSS 或导入 CSS。
- 缺少 `X-PreferencePanes-Version` 的 HEAD 200 不会被判为已安装。
- Surge、Loon、Stash、Shadowrocket、Egern 与 Quantumult X VM 测试、浏览器客户端测试和导入预览全部通过。

## 发布

1. 将 `dev` 合入 `main`，确认 `main` 与发布提交一致。
2. 创建并推送当前版本标签。
3. 等待 npm、GitHub Packages 和 Release Assets 工作流成功。
4. 确认 GitHub Release 完整包含 `api.js`、`index.html`、`index.mjs` 与 `navigation.mjs`，且不存在 `web.js`。
5. 下载 registry 包与 Release 资产，复核版本、内容和 SHA-256。

普通 main/dev 推送和手动 CI 只验证候选包，不发布。两个 registry 的版本取自 tag；正式版本使用 `latest`。

## 消费方顺序

Biliverse 必须在对应 PreferencePanes 版本发布后更新 Enhanced 模板，逐文件映射三个静态页面资源，并保留唯一固定存储 `api.js`。四个业务模块分别将自己的 `/api/{module}` 直接 Mock 到同版 BoxJS；最后部署站点，并更新聚合仓库。

业务 Release 使用整改后的 main 提交创建新 Tag 并发布完整资产。发布后下载所有资产复验，不只检查单个模板文件。

## 历史

- 1.1.2：曾由 `api.js` 二次请求同源 `/configs/{module}`，该内部请求无法重新进入代理 Mock 规则。
- 1.1.1：浏览器错误地直接访问 `/configs/{module}`，存储动作错误地收敛为 `/api/{module}/{action}`。
- 1.1.0：曾公开 API Model、视图 class 与页面输入，并为每个业务模块交付 `web.js`；该结构已由 1.1.1 移除。
- 1.0.0：首次分离 `api.js` 与 `web.js`。
- 0.1.0：2026-09-08 首次发布。
