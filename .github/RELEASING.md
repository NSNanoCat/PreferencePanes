# PreferencePanes 发布流程

## 1.1.2

1.1.2 恢复通用 API 与模板职责：浏览器只导出 `mount(boxjs)`，并通过 `GET /api/{module}` 获取原始 BoxJS；后端内部访问同源 `/configs/{module}`。存储统一使用 `POST /api/get|set|delete` 的单字段 form 协议，字段名为完整 `@root.path`。

这是对 1.1.1 职责边界的纠偏版本。npm 已发布版本不可覆盖，因此不能复用 1.1.1。

## 发布前验证

在要发布的提交上运行：

```sh
npm ci --registry=https://registry.npmjs.org/ --@nsnanocat:registry=https://registry.npmjs.org/
npm run build
npm run check
npm run apifox:check
npm pack --dry-run
```

必须确认：

- 根包没有运行时导出，browser 包只导出 `mount`。
- `dist/api.js` 只转发模块 BoxJS 并提供通用 Storage 深路径读写，`dist/web.js` 不直接请求 `/configs/*`。
- 所有浏览器请求都只使用 `/api/`，且不存在 `/api/{module}/{action}`。
- Surge、Loon、Stash、Shadowrocket、Egern 与 Quantumult X VM 测试、浏览器客户端测试和导入预览全部通过。

## 发布

1. 将 `dev` 合入 `main`，确认 `main` 与发布提交一致。
2. 创建并推送 `v1.1.2` 标签。
3. 等待 npm、GitHub Packages 和 Release Assets 工作流成功。
4. 确认 GitHub Release 完整包含 `api.js` 与 `web.js`。
5. 下载 registry 包与 Release 资产，复核版本、内容和 SHA-256。

普通 main/dev 推送和手动 CI 只验证候选包，不发布。两个 registry 的版本取自 tag；正式版本使用 `latest`。

## 消费方顺序

Biliverse 必须先更新并发布 Enhanced，使唯一通用 `web.js` 与 `api.js` 生效；随后更新 Global、Redirect、ADBlock，删除它们旧有的 PreferencePanes 前后端规则。最后部署站点，并更新需要同步的聚合仓库。

业务 Release 使用整改后的 main 提交重定向现有 Tag，并用 `--clobber` 替换完整资产。发布后下载所有资产复验，不只检查单个模板文件。

## 历史

- 1.1.1：浏览器错误地直接访问 `/configs/{module}`，存储动作错误地收敛为 `/api/{module}/{action}`。
- 1.1.0：曾公开 API Model、视图 class 与页面输入，并为每个业务模块交付 `web.js`；该结构已由 1.1.1 移除。
- 1.0.0：首次分离 `api.js` 与 `web.js`。
- 0.1.0：2026-09-08 首次发布。
