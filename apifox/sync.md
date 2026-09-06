# Apifox 同步状态

- GitHub：NSNanoCat/PreferencePanes，源分支 dev。
- Apifox：NSNanoCat 团队 4726347，Preference Panes 项目 8803052。
- 目标分支 main（8595006），默认模块 8522462。
- 文档路径：apifox/preference-panes.apifox.json。
- 计划方向：Git -> Apifox；不删除未匹配资源、不设置 Apifox -> Git 自动备份。
- 包发布：未执行；普通分支推送只触发 CI。

截至 2026-09-07，本地 JSON 包含 1 个示例路径、4 个 HTTP 操作（HEAD/GET/POST/DELETE）、16 个响应定义。POST 带非空 values schema，GET 包含完整字段 schema 和配置说明；HEAD 无正文。example.org 为文档占位，不是已部署的服务。

当前阻碍：

1. Apifox CLI 写入 main 返回 `403075 Automation caller branch required`。需由用户选择直接编辑权限或 AI 分支方式。
2. Git 连接创建返回 Not found，并提示先在“项目设置 -> Git 仓库连接”完成 Git 平台授权。目前没有成功建立 Git 连接或自动导入绑定。

已生成原生文档并保存在仓库；未声称 Apifox 导入或 Git 自动同步成功。解除权限限制后，应导入文档、回读实际资源 ID、更新原生文件中的 ID，再绑定 Git 数据源并验证客户端可见性。
