# PreferencePanes 单前端整改记录

本文记录 2026-09-13 的架构纠偏。当前公开契约以 `apifox/Specification.md`、类型声明和测试为准。

## 最终边界

- 浏览器包只公开 `mount(boxjs)`，同步返回 `destroy()` 句柄。
- 模块页面直接读取同源 `/configs/{module}`，不经过 API Model。
- `api.js` 只处理 HEAD 探测与 POST get/set/delete。
- `web.js` 只提供通用 `/settings/**` 页面和 `index.mjs`、`navigation.mjs`。
- 页面不接受 JSON/CSS 参数、私有 Header 或旧资源别名。
- Biliverse 仅 Enhanced 安装通用 `web.js`；其它业务模块只提供配置与 API。

## 非目标

- 不改变业务模块 BoxJS 字段、默认值、存储根或运行逻辑。
- 不把 Bilibili JSBridge、项目主页、主题实现或原生菜单协议加入 PreferencePanes。
- 不保留旧架构兼容层、并行入口或按模块生成页面。

## 验证

- PreferencePanes 构建、Biome、TypeScript、node:test、Apifox 生成校验和包清单。
- Surge 与 Quantumult X VM 路由隔离。
- 同一前端依次加载 Enhanced、Global、Redirect、ADBlock 的 BoxJS，并读写各自 API。
- Global、Redirect、ADBlock 所有模板不含 `web.js` 或 `/settings/**`；Enhanced 每份模板只含一个通用前端 provider。
- ADBlock 与聚合 BoxJs 的空降助手字段完全一致且只出现一次。

## 发布顺序

1. PreferencePanes v1.1.1。
2. Enhanced v0.5.14。
3. Global v0.8.22、Redirect v0.2.21、ADBlock v0.6.25。
4. BoxJs main 与 Biliverse.github.io main。
5. Universe dev gitlink。

远端发布完成后下载全部资产计算 SHA-256，并按“先 Enhanced，后其它业务模块”的安装顺序复验客户端规则。
