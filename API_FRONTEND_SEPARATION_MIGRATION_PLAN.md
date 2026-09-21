# PreferencePanes 单前端整改记录

本文记录 2026-09-13 的架构纠偏，并保留当时发布边界供历史追溯。该方案已于 2026-09-21 被独立静态页面资源方案替代；当前公开契约以 `apifox/Specification.md`、类型声明和测试为准。

## 当前边界

- 浏览器包只公开 `mount(boxjs)`，同步返回 `destroy()` 句柄。
- 模块页面通过业务模板的 `GET /api/{module}` 读取原始 BoxJS JSON。
- `api.js` 只处理 HEAD 探测与 POST get/set/delete。
- Release 分别发布 `index.html`、`index.mjs`、`navigation.mjs`，消费方逐文件映射，不执行页面响应脚本。
- 页面接受 `json`、`css` 查询参数；`ModuleFrame` 将同名资源输入写入 iframe dataset，不向静态文件请求发送私有 Header。
- Biliverse 仅 Enhanced 安装三个静态页面资源与固定存储 `api.js`；其它业务模块只提供配置与模块 API。

## 非目标

- 不改变业务模块 BoxJS 字段、默认值、存储根或运行逻辑。
- 不把 Bilibili JSBridge、项目主页、主题实现或原生菜单协议加入 PreferencePanes。
- 不保留动态生成页面正文的 `web.js`、`mock.js`、旧架构兼容层、并行入口或按模块生成页面。

## 验证

- PreferencePanes 构建、Biome、TypeScript、node:test、Apifox 生成校验和包清单。
- Surge、Loon、Quantumult X、Stash 与 Shadowrocket 分别将三个页面路径映射到对应静态文件。
- 同一前端依次加载 Enhanced、Global、Redirect、ADBlock 的 BoxJS，并读写各自 API。
- Global、Redirect、ADBlock 所有模板不含页面资源或 `/settings/**`；Enhanced 每份模板只含三个静态页面映射。
- ADBlock 与聚合 BoxJs 的空降助手字段完全一致且只出现一次。

## 历史发布顺序

2026-09-13 当时的发布顺序为 PreferencePanes v1.1.1、Enhanced v0.5.14、Global v0.8.22、Redirect v0.2.21、ADBlock v0.6.25、BoxJs main、Biliverse.github.io main 与 Universe dev gitlink。后续版本不应复用其中的动态页面响应脚本方案。

远端发布完成后下载全部资产计算 SHA-256，并按“先 Enhanced，后其它业务模块”的安装顺序复验客户端规则。
