# @nsnanocat/preference-panes

未发布的通用配置键值 API，基于 `@nsnanocat/util`。源码：[NSNanoCat/PreferencePanes](https://github.com/NSNanoCat/PreferencePanes)。

## 路径就是数据层级

```http
POST /api/Enhanced/Settings/Home/Top_left
Content-Type: application/json
X-Settings-Client: 1

"mine"
```

这会写入 database 对应的 `Enhanced.Settings.Home.Top_left`。固定路径前缀只有 `/api/`，后续层级由调用方的数据结构决定。存储操作修改持久化对象，不修改源码 `database.mjs`。

| 方法 | 请求正文 | 成功响应 |
| --- | --- | --- |
| HEAD | 无 | 200，无正文；表示该字段已声明，不读取存储 |
| GET | 无 | 200，JSON 值本身；缺省且无默认值则 404 |
| POST | JSON 值本身，如 `"mine"`、`false`、`0`、`[]` | 204，无正文；创建或修改单键 |
| DELETE | 无，键由 URL 指定 | 204，无正文；删除覆盖值，幂等 |

## 使用

```js
import { createSettingsHandler, parseSettingsPath } from "@nsnanocat/preference-panes";
const handle = createSettingsHandler({
  origin: "https://example.org",
  storageKey: "BiliBili",
  fields: [{ key: "Enhanced.Settings.Home.Top_left", name: "顶栏左侧", type: "string", defaultValue: "mine" }]
});
const response = handle($request);
// Surge/Loon 示例；其它平台继续使用现有 util done 适配。
if (response) $done({ response });
else $done({});
```

`parseSettingsPath(url)` 统一解析 URL，返回安全的键路径片段。`createSettingsHandler` 统一调用 util 的 Storage 和 Lodash.get/set/unset，fields 的所有选项共用同一读写逻辑。不包含域名、组织名、模块名或 Settings 层级常量。

fields 使用完整 database 点路径，类型为 boolean/number/string/array，保留 argument config 的 name/defaultValue/options/description。路径必须唯一且不能父子重叠。schema 只授权单个声明键，未声明键返回 404；不开放任意整树写入。Origin 和页面专用 header 检查继续保留，但不是认证机制，也不放行跨域 OPTIONS。

`resolveSettings(stored)` 可在 GET 时返回完整的有效 database 对象，处理存储/参数/默认值优先级；不传时读取持久化对象。它不在 HEAD/POST/DELETE 时执行，不改变参数优先级。POST 只保存一个明确值，DELETE 只删除一个覆盖值，保留同级字段和缓存。中间 util 序列化的 JSON 对象会解码后继续遍历，错误不静默吞掉。

## Apifox

项目：[Preference Panes](https://app.apifox.com/project/8803052)，GitHub main/dev 分别绑定 Apifox 同名分支。

- [通俗说明及四种操作示例](apifox/guide.md)
- [Apifox 原生 JSON](apifox/preference-panes.apifox.json)
- [数据源绑定记录](apifox/sync.md)

示例域名 `example.org` 没有部署服务。Apifox 展示一个具体叶子键的完整路径，实际可用路径由调用方 fields 决定；更改本包不意味着已发布的 Biliverse 插件自动支持新契约。

## 开发

```sh
npm ci --registry=https://registry.npmjs.org/ --@nsnanocat:registry=https://registry.npmjs.org/
npm run build
npm run check
npm run apifox:generate
node scripts/generate-apifox.mjs --check
npm pack --dry-run
```

纯 ESM 与 TypeScript 声明。Node 使用 util 文件存储条件导出，代理脚本用 Rollup 等工具选择默认/import 条件打包。检查包括路径解析、各类型值、嵌套键和 util 序列化对象、数据隔离、GET resolver、HEAD 无存储访问、删除幂等、Node 和 Quantumult X 存储后端。

## 发布边界

普通 main/dev push 只运行 CI，不发布包。两个 `v*` tag workflow 分别发布 npm 和 GitHub Packages：先构建、lint/typecheck/test；稳定版 latest，预发布用 beta/alpha 等 dist-tag。两端显式指定 registry，npm 用 OIDC、GitHub Packages 用发布步骤的 GITHUB_TOKEN。

尚未创建版本 tag、npm 包或 GitHub Package，也未接入 Biliverse。首次包发布和 Trusted Publisher 配置仍待用户评审确认。参考：[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)、[GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)。
