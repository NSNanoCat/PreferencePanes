# Apifox 同步状态

- GitHub：NSNanoCat/PreferencePanes，main 与 dev 分别对应 Apifox 同名分支。
- Apifox：NSNanoCat 团队 4726347，Preference Panes 项目 8803052。
- 目标分支 main（8595006）、dev（8595065），默认模块 8522462。
- 文档路径：apifox/preference-panes.apifox.json。
- 同步方向：Git -> Apifox；不删除未匹配资源、不设置 Apifox -> Git 自动备份。
- Git 连接 2231 已由用户授权 NSNanoCat/PreferencePanes。
- main 自动导入配置 725861，来源 auto-import.json：GitHub main -> Apifox main。
- dev 自动导入配置 725860，来源 auto-import-dev.json：GitHub dev -> Apifox dev。
- 之前的 dev -> main 配置 725859 已删除，只替换绑定，不删除接口。
- 每 30 分钟由打开项目的 Apifox 客户端执行（runOn=APP），不是 Git push webhook。
- 包发布：未执行；普通分支推送只触发 CI。

截至 2026-09-07，本地 JSON 包含 1 个示例路径、4 个 HTTP 操作（HEAD/GET/POST/DELETE）、16 个响应定义。POST 带非空 values schema，GET 包含完整字段 schema 和配置说明；HEAD 无正文。example.org 为文档占位，不是已部署的服务。

首次同步验证：

1. 重新打开客户端项目后，两条 Git 自动导入均执行成功。main latestImportAt=2026-09-06T19:18:01Z，dev latestImportAt=2026-09-06T19:18:00Z。
2. main 接口 ID：HEAD 511372920、GET 511372921、POST 511372922、DELETE 511372923。
3. dev 接口 ID：HEAD 511372916、GET 511372917、POST 511372918、DELETE 511372919。
4. main/dev 各回读到四个接口。客户端 main 的“设置读写（示例实例）”显示四项。两个分支独立导入，资源 ID 不相同。
5. CLI 手动编辑内容此前被外部 AI 权限限制；本次通过已授权 Git 数据源完成首次导入，没有更改 AI 编辑权限。

文档应先修改 Git 仓库的对应分支，再由同名 Apifox 分支导入。main/dev 不交叉绑定；发布 npm/GitHub Packages 仍需单独确认。
