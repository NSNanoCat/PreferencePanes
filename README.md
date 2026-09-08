# @nsnanocat/preference-panes

通用 WebView 设置面板与代理持久化存储桥接。0.3.0 起，BoxJS 完全由前端解析；API 只按安装配置中的根和模块读写数据，不下载配置、不重复校验字段或枚举。

## 目录

| 目录 | 内容 |
| --- | --- |
| src/SettingsHandler.mjs | 模块存储桥接 class |
| src/browser/ | WebView 控件、内存会话和样式 |
| src/lib/ | 前端 BoxJS 与通用路径解析 |
| src/proxy/ | 代理宿主打包入口 |
| test/ | 类型与行为回归测试 |
| examples/ | BoxJS、HTML 和 Surge 集成示例 |
| apifox/ | 接口说明、原生 JSON 与生成器 |
| .github/ | CI、双平台发布工作流 |
| dist/ | 构建产物，不提交 Git |

Biome 与 NSNanoCat Util/FlatBufferRoot 对齐：tab、LF、320 列，保留统一 lint 规则。类型声明位于 src/index.d.ts 和 src/browser/index.d.ts，JSDoc 使用中英双语。

## 代理接口

~~~js
import { SettingsHandler } from "@nsnanocat/preference-panes";

const handler = new SettingsHandler({
  origin: "https://example.org",
  storageKey: "Root",
  module: "Module"
});
const response = await handler.handle($request);
// 使用现有代理宿主的 done 适配。
// Adapt the response with the existing proxy host's done function.
~~~

安装配置固定 Root.Module，浏览器不能通过 header 指定其它根。API 不接受 configURL、loadConfig 或 resolveSettings，也不依赖 BoxJS 是否可用。

| 请求 | 行为 |
| --- | --- |
| HEAD /api/Module/… | 确认路由可达，不读取存储 |
| GET /api/Module/Settings/key | 返回原值，缺失返回 404 |
| POST /api/Module/Settings/key | 以任意 JSON 值替换该位置，成功 200 |
| DELETE /api/Module/Settings/key | 删除键或子树，不存在也成功 |
| GET /api/Module/Caches | 返回所有 Caches |
| DELETE /api/Module/Caches | 清空缓存，保留 Settings |
| DELETE /api/Module/ | 重置模块全部数据，保留 Root 下其它模块 |

POST 正文就是值本身，允许对象、数组、null、字符串、数字或布尔值。不存在于 BoxJS 中的键也允许读写。使用 util Storage/Lodash 做根对象读改写，保留同级数据；每次 GET 读一次根，POST/DELETE 读一次再写一次，不发网络请求。仍检查模块归属、路径格式、请求来源、JSON 语法和正文大小；不做 BoxJS 业务校验。

## WebView

~~~js
import { mountPreferencePanes } from "@nsnanocat/preference-panes/browser";
import "@nsnanocat/preference-panes/browser/panel.css";

const panel = mountPreferencePanes({ element: document.querySelector("#preferences") });
// 卸载时调用 panel.destroy()。
// Call panel.destroy() when unmounting.
~~~

同一份 HTML 从 /settings/{module} 读取模块名，再 GET /configs/{module} 取得 BoxJS 并生成控件。配置源地址写在模块的 Mock 规则中，不写入页面 query 参数或 API。

每次进入主菜单仅并发 HEAD 各配置 Mock。打开、再次进入或刷新模块页，各 GET 一次 BoxJS 与设置子树；404 的设置子树按无覆盖值处理。保存/删除根据 HTTP 200 更新页面缓存并显示通知，不追加 GET。

设置页使用分组行布局：单选为下拉框，开关为即时切换，多选显示摘要并进入可前进/后退的二级选项页。文本输入、下拉选择及勾选变化均立即串行 POST，无逐项保存或删除按钮；失败恢复当前项已保存值，较新的输入不会被较早请求覆盖。多选页返回时保留主列表滚动位置，不重新 GET 配置。单键 DELETE 能力保留在 API/客户端方法中，不作为逐项页面按钮展示。

模块页底部提供查看/刷新 Caches、清空 Caches 和重置模块。查看缓存按需 GET；清空和重置经确认后 DELETE，成功只更新本页状态。重置后控件显示当前 BoxJS 默认值，再次进入页面才重新读取。模块选择、设置值校验和默认值处理都在前端完成。

业务主菜单由调用项目维护，Biliverse 的入口和四个模块按钮归 Enhanced。未提供对应配置 Mock 的插件入口保持禁用。

## BoxJS 兼容

前端接受字段数组、单 app 和 apps 订阅。字段 ID 为 @根.模块.子路径.键；模块归属来自字段 ID，不能用 app 名称推断。

- name/val/type/desc/items：控件标题、默认值、类型、说明和选项。
- boolean/selects/checkboxes/text/textarea/number：支持的控件类型。
- placeholder/rows/autoGrow：输入提示、多行基础行数和自动高度。
- app name/author/desc/descs/repo：纯文本标题、作者、说明和项目链接。
- icon/icons：显式图标优先，原版 icons 为透明/彩色顺序，不是亮暗顺序。
- script：仅保留元数据，不下载或执行。

不执行 BoxJS HTML、脚本、动态字符串 items，不通过 keys 推导额外字段。WebView 使用原生网络与对象访问，不打入 util 的网络、存储或 Lodash polyfill。代理安装的 storageKey/module 应由接入方与 BoxJS 路径保持一致。

## 构建与发布

~~~sh
npm ci --registry=https://registry.npmjs.org/ --@nsnanocat:registry=https://registry.npmjs.org/
npm run build
npm run check
npm run apifox:generate
npm run apifox:check
npm pack --dry-run
~~~

构建生成 dist/preference-panes.mjs 和 dist/preference-panes.request.js；公开 import 路径由 exports 保持稳定。0.3.0 的安装参数替换 0.2.0 的 configURL，HTTP 读写从声明字段变为模块内的任意数据，是一次契约升级。

[完整接口说明](apifox/guide.md) · [Apifox JSON](apifox/preference-panes.apifox.json) · [同步方式](apifox/README.md) · [发布工作流](.github/RELEASING.md)
