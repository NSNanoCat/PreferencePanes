# 接口文档

- `Specification.md`：当前接口规范、请求示例与缓存时序。
- `generate.mjs`：维护接口定义，以仓库 Biome 配置格式化原生 Apifox JSON，CI 用同一生成器检查是否过期。
- `preference-panes.apifox.json`：提交到 Git、供 Apifox 导入的原生文档。

```sh
npm run apifox:generate
npm run apifox:check
```

项目为 [NSNanoCat / Preference Panes](https://app.apifox.com/project/8803052)。已绑定 GitHub 仓库的 `main` 和 `dev`，分别导入 Apifox 同名分支；文件路径固定为 `apifox/preference-panes.apifox.json`。这些绑定由 Apifox 管理，不需要在仓库保留首次创建请求或运行流水。

原生格式按 Method 与 Path 匹配接口并覆盖；接口模式为 `methodAndPath`，文档和数据模型模式为 `name`。保持“删除未匹配资源”关闭。导入在本机客户端每 30 分钟执行，也可在绑定数据源页面立即导入；推送后应按分支回读确认，不能仅凭导入时间判断成功。

当前模块 API 包含业务模板直接提供的 `HEAD /api/{module}` 与原样 BoxJS 的 `GET /api/{module}`；持久化使用 PreferencePanes `api.js` 提供的固定 `POST /api/get|set|delete` form 接口。生成文件不含 `/configs/{module}`、`/api/{module}/get|set|delete` 或 `/api/module/{module}` 路径。

接口集合同时记录三个责任域：Release 的 `index.html`、`index.mjs`、`navigation.mjs` 提供 `/settings/**` 静态页面资源，唯一通用 `api.js` 提供固定存储接口，业务模板提供 `/api/{module}`。Apifox 中共同展示不代表这些路径由同一个产物处理。
