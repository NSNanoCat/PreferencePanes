# 调用方集成：单文档设置框架

PreferencePanes 的 `home.html` 内置程序、默认 CSS、网页导航和菜单，原样部署到 `/settings/`。首页、模块和字段子页在同一文档渲染；不再提供模块 HTML、页面 JS 或 ModuleFrame。

## 内容与宿主

项目提供必需的 `./home.json`，可选的 `./theme.css`、`./bridge.mjs` 和 JSON 引用的图片。资源相对于首页 URL 解析；CSS 和 Bridge 通过 HEAD 探测，404 使用默认功能，200 加载，其它状态或加载、初始化失败显示错误。项目样式位于默认样式之后。未提供 Bridge 时不导入 SDK、不按 User-Agent 自动启用原生接入。

Bridge 默认导出工厂，接收 `{menu, back}`，返回 `{update, confirm, notice, openURL, destroy}`；类型来自 `@nsnanocat/preference-panes/browser`。项目自行加载官方 SDK，维护原生标题、MORE、主题和键盘协议；框架只保留一套宿主能力。`update` 接收 `{title, actions, busy, canGoBack}`，`confirm` 返回 boolean 或 Promise<boolean>，`notice` 接收 `{kind, message}`。

## 按需加载与导航

首页仅 `HEAD /api/{module}`；状态为 200 且版本头非空时显示已安装。点击后才 `GET /api/{module}` 读取原始 BoxJS，随后 `POST /api/get` 读取设置。实际模块和存储根由 JSON 字段 ID 推导，API 别名直接使用自己的配置地址，无需 pageModule。

路由依次为 `/settings/`、`#Module`、`#Module/<view>`。字段子页保留会话，切换模块或返回首页结束会话。刷新、前进后退、滚动恢复和浏览器页面缓存使用同一导航。退出取消配置和设置读取，忽略迟到的配置、确认和通知；已经开始的持久化写入继续完成。

公开浏览器入口仍为 `mount(boxjs)`，没有容器、宿主、导航或菜单参数。它复用内部页面控制器，返回 `destroy()` 生命周期句柄。

## 外链与代理集成

首页 JSON 链接可指定 `internal`、`_self` 或 `_blank`。只有 `internal` 外部网站使用隔离 iframe，保留宿主导航与返回；它不注入表单或项目样式，也不能替换顶层页面。其余链接调用 `openURL(url, target)`；模块 URL 字段仍调用 `openURL(url)`。

网页框架可直接部署 GitHub Pages；代理模块仅安装固定 `/api/get|set|delete` 的 `api.js` 和各自 `/api/{module}` 配置 Mock。Biliverse Enhanced 仍可唯一映射共用 `home.html`、品牌 JSON/CSS/Bridge/图片，其它插件提供自己的配置。请求地址必须区别于 Mock 的远程文件地址，避免资源循环。
