# @nsnanocat/preference-panes

外部配置只有两个输入：**BoxJS JSON** 和可选的 **CSS 正文**。省略 CSS 时使用包内默认样式。

```js
import { build } from "@nsnanocat/preference-panes";
import boxjs from "./settings.boxjs.json" with { type: "json" };

const files = await build(boxjs);
// 自定义风格时传入 CSS 文件正文。
// Pass CSS file contents to customize the appearance.
const themedFiles = await build(boxjs, ".pp-panel { --pp-accent: #16866a; }");
```

返回值为相对路径到文件正文的映射。调用方写出并托管文件即可，不维护页面代码、菜单 JSON、安装映射、资源规则表或脚本拼接逻辑。

调用方安装本包没有额外运行时依赖；代理使用的 util 与 URL 支持已在包内预构建。

已有 WebView 页面可以直接使用同样的两个输入，样式由包自行挂载，无需额外导入默认 CSS：

```js
import { mount } from "@nsnanocat/preference-panes/browser";

const page = mount(boxjs, ".pp-panel { --pp-accent: #16866a; }");
// 离开宿主页面时释放监听器、样式与会话。
// Release listeners, styles and sessions when leaving the host page.
page.destroy();
```

主页的安装工具依据当前页面地址生成代理规则；无需传入域名或配置资源 URL。通用模块与各业务模块的配置 Mock 分开安装，通用模块不接管 `/configs/`。

CSS 是正文，不是网址或样式配置对象。引用图片或外部样式时使用绝对或站点根相对 URL。模块字段也不必位于名为 Settings 的目录，页面从字段公共路径确定一次读取的范围。

## 自动推导

- 支持 BoxJS 字段数组、单个 app、`apps` 订阅。
- `@Root.Module.Settings.key` 决定存储根 Root、模块 Module 和字段路径；不同模块可使用不同根。
- 同名模块指向不同根时拒绝输入，避免路由歧义。
- 名称、图标和说明来自 BoxJS 标准元数据；app 的 id/name 不覆盖字段 ID 的存储映射。
- 控件、默认值、单选与多选来自 `settings`，不在页面代码中固定字段。

## 运行行为

固定相对路径为 `/settings/{module}`、`/configs/{module}`、`/api/{module}/…`，来源由实际页面或请求 URL 决定。没有 `origin`、`storageKey`、`module`、`requestHeader`、`resources` 等外部安装参数。

主菜单每次进入只 HEAD 配置 Mock。打开或刷新模块页，再 GET 一次 BoxJS 与一次设置子树。没有有效配置就不显示表单、不读取设置 API。通用代理不接管 `/configs/`，不会替未启用的业务模块响应配置。

单选使用下拉框，多选使用二级页。修改后即时串行写入，成功只更新页面内存并通知，不追加 GET；失败恢复已有值。保留 Caches 查看/清空和模块重置，不展示逐字段保存、删除按钮。

代理根据构建输入中的字段 ID 建立存储映射，使用 util 直接读写目标 JSON 路径，不下载 BoxJS，也不二次校验控件或枚举。来源校验使用当前请求 URL 的 origin；固定页面标记头为 `X-Settings-Client: 1`。

## 维护

源码遵循 AGENTS.md 和通用 Biome 配置：四空格、LF、320 列，中英双语文档注释。旧版安装对象和外部菜单配置不保留兼容入口。

```sh
npm run check
npm run apifox:generate
npm run apifox:check
npm run preview
```

预览也只读取两个输入，可用 `node examples/preview.mjs settings.boxjs.json theme.css` 指定文件。预览执行包生成的代理脚本，存储在独立内存中。

[接口规范](apifox/Specification.md) · [Apifox JSON](apifox/preference-panes.apifox.json)
