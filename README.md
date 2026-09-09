# @nsnanocat/preference-panes

PreferencePanes **只负责具体模块的设置页**。外部输入为这个模块的 BoxJS JSON 和可选 CSS；省略 CSS 使用默认样式。

项目定制主页由 github.io 等调用方独立维护。主页只探测各模块的 JSON 是否可访问，并提供入口；它的布局、品牌、按钮目录不属于 PreferencePanes。本包不生成主页、模块选择目录或安装选择器。

## 导入一个模块

```js
import { mount } from "@nsnanocat/preference-panes/browser";
import boxjs from "./Module.boxjs.json" with { type: "json" };

const page = mount(boxjs, ".pp-panel { --pp-accent: #16866a; }");
// 离开模块页时释放视图、样式、监听器和会话。
// Release the view, styles, listeners and session when leaving the module page.
page.destroy();
```

调用后直接显示该 JSON 对应的模块设置，不先显示入口页，也不按当前 URL 选择其它模块。一次输入必须恰好包含一个可推导模块；多模块文件会报错，不会生成菜单。支持字段数组、单 app 和只包含该模块的 apps 订阅。

`@Root.Module.Settings.key` 推导根、模块和字段路径；app 的 id/name 不替代存储映射。模块名、标题、说明、图标和选项来自 BoxJS。CSS 是正文字符串，作用于该模块文档；嵌入项目主页时应使用独立模块页面或 iframe，避免样式作用到宿主。

## 构建模块产物

```js
import { build } from "@nsnanocat/preference-panes";

const files = await build(boxjs, css);
```

返回相对路径到正文的映射，调用方写出并托管即可。每次只生成该模块的 HTML、CSS、BoxJS、读写脚本、配置 Mock 和公共启动 JS。模块文件名独立，可以合并不同模块的产物；不会输出或覆盖项目的 `settings/index.html`。

直接访问 `/settings/{module}` 时，启动器先导入 `/configs/{module}` JSON 与该模块 CSS，再调用 mount。JSON 缺失或与 URL 不符时不生成表单。项目主页可自行 HEAD `/configs/{module}` 判断入口可用性；PreferencePanes 不接管主页探测逻辑。

## 模块页行为

渲染器使用已导入的 JSON 创建控件，只 GET 一次设置子树；不会再次请求配置或探测其它模块。打开/刷新模块文档重新导入，再读取设置。单选为下拉框，多选为二级选项页；二级返回不刷新设置值。

修改立即串行 POST，200 后更新当前内存并通知；失败恢复已保存值。保留 Caches 查看/清空和模块重置，不展示逐字段保存或删除按钮。API 按 BoxJS 根和模块用 util 读写任意 JSON 路径，不重复校验控件或枚举。

## 文件导入测试台

```sh
npm run preview
```

浏览器中选择一个模块的 JSON、可选 CSS，点击“生成”，在独立 iframe 查看模块页。不会自动装入示例，不会生成项目主页。CSS 隔离在预览文档内；测试数据只保存在内存，不访问用户代理存储。

## 维护

遵循 AGENTS.md 与通用 Biome 配置。运行 `npm run check` 和 `npm run apifox:check` 验证代码、类型、行为与文档。0.7.0 采用单模块双输入接口，运行时无额外 npm 依赖；旧的主页生成和安装对象接口不再提供。

[接口规范](apifox/Specification.md) · [Apifox JSON](apifox/preference-panes.apifox.json)
