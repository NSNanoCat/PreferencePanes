# API 前后端分离迁移计划

本文是本次迁移的执行记录，不是当前接口规范。当前契约以 `apifox/Specification.md`、公开类型和测试为准。

## 已确认边界

- 后端 `api.js` 只接管 `/api/{module}`、`/api/{module}/get`、`set`、`delete`。
- 后端取得原始 BoxJS，只按字段 ID 确认允许访问的完整 `@root.path`，不解释控件、选项、默认值或展示元数据。
- 后端直接调用 `@nsnanocat/util` 的 `Storage.getItem`、`setItem`、`removeItem`，不再维护第二层 Store 封装。
- 前端独占 BoxJS 控件解析、值规范化、值校验和 DOM 渲染。
- 前端页面与静态资源由独立 `web.js` 提供；后端 `api.js` 不包含、映射或返回 HTML、CSS、浏览器 JavaScript。
- HTML 只加载前端脚本并调用 API，不承担后端 URL 路由。

## 非目标

- 不改变业务模块的 BoxJS 字段、存储键和默认值。
- 不引入鉴权、中间件、兼容旧 `/api/get|set|delete` 的回退或新的配置层。
- 不修改 Biliverse 客户端 Bridge、页面视觉样式和模块业务脚本。
- 本次只创建本地 `dev` 提交，不推送、不发布。

## 执行顺序

1. [x] **计划基线（PreferencePanes）**
   - 提交本文件。
   - 验证：工作树除本文件外无变化；提交遵守 Conventional Commits。

2. [x] **单一后端 API（PreferencePanes）**
   - 用 `src/api.mjs` 取代 `src/proxy/handler.mjs` 和 `src/ModuleApi.mjs`。
   - 将响应构造、代理宿主完成响应和字段 ID 查找收进同一后端文件。
   - 删除 `src/Store.mjs`、`src/lib/response.mjs`、`src/proxy/response.mjs`，直接使用 util `Storage` 深路径 API。
   - `dist/api.js` 不再包含 HTML 或浏览器资源。
   - 验证：模块 API、平台 Storage、构建隔离测试及完整 `npm run check`。
   - 计划提交：`refactor(api): 收敛独立后端入口`。

3. [x] **前端 BoxJS 解析（PreferencePanes）**
   - 将公共 `src/BoxJS.mjs` 与 `src/lib/boxjs.mjs` 收敛为浏览器侧 BoxJS 解析模块。
   - 后端不得导入前端解析器；构建器只读取生成前端路径所需的单模块名称。
   - 验证：BoxJS、浏览器渲染、构建和类型测试。
   - 计划提交：`refactor(browser): 收敛 BoxJS 页面解析`。

4. [x] **独立前端交付（PreferencePanes）**
   - 新增只返回 `/settings/{module}`、`app.mjs`、`navigation.mjs` 的 `web.js` 构建入口。
   - 保持现有静态 `dist/module/` 产物；`web.js` 不访问网络或 Storage。
   - Release 工作流分别上传 `api.js` 和 `web.js`。
   - 验证：静态资源路由、API 路由隔离、构建产物内容检查及完整 `npm run check`。
   - 计划提交：`refactor(web): 独立设置页面交付`。

5. [x] **契约与文档（PreferencePanes）**
   - 更新 README、Apifox Specification、HostIntegration、生成器和原生 Apifox JSON。
   - 明确 `api.js` 与 `web.js` 的安装规则和发布顺序。
   - 验证：`npm run apifox:generate`、`npm run apifox:check`、`git diff --check`。
   - 计划提交：`docs(api): 记录前后端独立契约`。

6. [x] **网站调用与预览（Biliverse.github.io）**
   - 模块页面和公共浏览器资源交给 `web.js`，模块数据请求交给 `api.js`。
   - 更新本地预览、网站说明和测试，不改变 Biliverse Bridge 与视觉代码。
   - 验证：`pnpm settings:build`、`settings:check`、`settings:test`。
   - 计划提交：`refactor(settings): 分离页面与模块 API`。

7. [x] **业务模板（Enhanced）**
   - API 规则只匹配 `/api/{module}` 路径；页面与静态资源规则改用 `web.js`。
   - 重新生成模板产物并运行仓库既有检查。
   - 计划提交：`refactor(settings): 分离页面与模块 API`。

8. [x] **业务模板（Global）**
   - 与 Enhanced 使用同一前后端规则，保持 Global 自己的配置 Mock 不变。
   - 重新生成模板产物并运行仓库既有检查。
   - 计划提交：`refactor(settings): 分离页面与模块 API`。

9. [x] **业务模板（Redirect）**
   - 与 Enhanced 使用同一前后端规则，保持 Redirect 自己的配置 Mock 不变。
   - 重新生成模板产物并运行仓库既有检查。
   - 计划提交：`refactor(settings): 分离页面与模块 API`。

10. [x] **业务模板（ADBlock）**
    - 修改前先将本地 `dev` 快进到 `origin/dev`，不得覆盖远端新增提交。
    - 与 Enhanced 使用同一前后端规则，保持 ADBlock 自己的配置 Mock 不变。
    - 重新生成模板产物并运行仓库既有检查。
    - 计划提交：`refactor(settings): 分离页面与模块 API`。

11. [x] **最终核验与计划收口**
    - 核对六个仓库的分支、工作树、提交范围和未推送状态。
    - 搜索旧 API 路径以及由 `api.js` 返回 `/settings/**` 的残留。
    - 在本文件记录各步骤提交哈希和最终验证结果。
    - 计划提交：`docs(plan): 完成 API 前后端分离记录`。

## 上下文压缩后的恢复步骤

1. 重新读取本文件，不重新设计已经确认的边界。
2. 分别检查 PreferencePanes、Biliverse.github.io、Enhanced、Global、Redirect、ADBlock 的 `dev`、工作树和最近提交。
3. 用上述计划提交信息判断已完成步骤，从第一个未完成步骤继续。
4. 不重做已经提交的步骤，不修改无关文件，不推送或发布。
5. 每个步骤都先验证、检查 staged 路径和 `git diff --cached --check`，再创建对应提交。

## 完成记录

| 步骤 | 仓库 | 提交 | 验证 |
| --- | --- | --- | --- |
| 计划基线 | PreferencePanes | `9c8165b` | 计划文件单独提交 |
| 单一后端 API | PreferencePanes | `803bd7d` | 构建、类型、Biome、45 项测试及 API 构建隔离通过 |
| 前端 BoxJS 解析 | PreferencePanes | `2a90853` | 构建、类型、Biome、44 项测试及前后端导入隔离通过 |
| 独立前端交付 | PreferencePanes | `06b683a` | `api.js`/`web.js` 隔离、构建、类型、Biome 及 46 项测试通过 |
| 契约与文档 | PreferencePanes | `078616a` | Apifox 10 操作/8 路径/3 JSON 动作、完整构建和 46 项测试通过 |
| 网站调用与预览 | Biliverse.github.io | `5e7f859` | 9 个设置输出、4 项测试及改动文件 Biome 通过 |
| 业务模板 | Enhanced | `57b8758` | release/dev 生成、28 项测试及改动文件 Biome 通过；全仓 Biome 仍有既有 `example`、`unreleased` 和旧源码问题 |
| 业务模板 | Global | `79b650a` | release/dev 生成、5 项测试及改动文件 Biome 通过；全仓 Biome 仍有既有 `example`、`unreleased` 和旧源码问题 |
| 业务模板 | Redirect | `9547952` | release/dev 生成、5 项测试及改动文件 Biome 通过；全仓 Biome 仍有既有生成文件和旧源码问题 |
| 业务模板 | ADBlock | `fb857f5` | 先快进到 `f24d1d4`；release/dev 生成、25 项测试及改动文件 Biome 通过；全仓 Biome 仍有既有生成文件和旧源码问题 |
| 最终核验 | PreferencePanes | 本步骤提交 | 六仓库均为本地 `dev` 且工作树干净；旧组合路由与旧后端分层引用搜索为零；核心 46 项测试和网站 4 项测试通过 |
