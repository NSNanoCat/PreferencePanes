# Apifox 同步状态

- GitHub：NSNanoCat/PreferencePanes，源分支 dev。
- Apifox：NSNanoCat 团队 4726347，Preference Panes 项目 8803052。
- 目标分支 main（8595006），默认模块 8522462。
- 文档路径：apifox/preference-panes.apifox.json。
- 同步方向：Git -> Apifox；不删除未匹配资源、不设置 Apifox -> Git 自动备份。
- Git 连接 2231 已由用户授权 NSNanoCat/PreferencePanes。
- 自动导入配置 725859（GitHub - PreferencePanes）已创建并经 CLI 回读确认。
- 来源配置见 auto-import.json；每 30 分钟，由打开项目的 Apifox 客户端执行（runOn=APP），不是 Git push webhook。
- 包发布：未执行；普通分支推送只触发 CI。

截至 2026-09-07，本地 JSON 包含 1 个示例路径、4 个 HTTP 操作（HEAD/GET/POST/DELETE）、16 个响应定义。POST 带非空 values schema，GET 包含完整字段 schema 和配置说明；HEAD 无正文。example.org 为文档占位，不是已部署的服务。

当前验证状态：

1. Apifox CLI 写入 main 返回 `403075 Automation caller branch required`。需由用户选择直接编辑权限或 AI 分支方式。
2. Git 连接与自动导入绑定已存在。首次回读 latestImportAt=null，接口列表仍为空，客户端绑定数据源页面暂未显示新条目；尚未完成首次导入验证。

已生成原生文档并保存在仓库。绑定创建成功不等于已导入成功；首次同步完成后应回读四个接口、资源 ID 和客户端可见性。
