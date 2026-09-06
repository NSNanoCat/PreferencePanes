# @nsnanocat/preference-panes

待评审的代理脚本设置 API 运行时，尚未发布 npm/GitHub Packages。代码仓库为 [NSNanoCat/PreferencePanes](https://github.com/NSNanoCat/PreferencePanes)。

## Apifox 文档

团队 NSNanoCat，项目 [Preference Panes](https://app.apifox.com/project/8803052)，目标分支 main。通俗说明见 [配置与读写流程](apifox/guide.md)，原生文档数据为 [preference-panes.apifox.json](apifox/preference-panes.apifox.json)。在 GET 接口描述中也嵌入了完整说明，包括 endpoint、storageKey、requestHeader 和 resolveSettings。

运行 `npm run apifox:generate` 更新原生 JSON，运行 `node scripts/generate-apifox.mjs --check` 检查生成文件一致性。文档源位于 GitHub dev，计划单向 Git -> Apifox 同步；不启用反向自动备份。绑定与导入当前状态见 [同步记录](apifox/sync.md)。

## 职责

从 argument 配置生成的字段数组驱动同一个处理器，统一 GET 读取、POST 校验与持久化、HEAD 健康探测。底层只调用 `@nsnanocat/util` 的 `Storage` 和 `Lodash.get/set`，不按选项手写读写代码。

没有项目域名、组织名、存储根键或业务字段常量。页面、亮暗样式、导航、静态 Mock、argument-to-JSON 生成器仍由调用方提供。未来其他组织使用时无需修改本包。

## API

纯 ESM 导出 `createSettingsHandler`，附带 TypeScript 声明。可直接使用字段定义的 `key/name/type/defaultValue/description/options`；传入可序列化数据，不能传整个 arguments-builder 的 output 配置。

```js
import { createSettingsHandler } from "@nsnanocat/preference-panes";

const handleSettings = createSettingsHandler({
  module: "Weather",
  endpoint: "https://example.org/settings/api/Weather",
  storageKey: "@ExampleOrg.Weather.Settings",
  fields: [
    { key: "alerts.enabled", name: "天气预警", type: "boolean", defaultValue: true },
    { key: "language", name: "语言", type: "string", defaultValue: "zh", options: [
      { key: "zh", label: "中文" }, { key: "en", label: "English" }
    ] }
  ]
});

const response = handleSettings($request);
// 在现有平台适配入口内完成响应；Surge / Loon 示例：
if (response) $done({ response });
else $done({});
```

| 参数 | 含义 |
| --- | --- |
| `module` | 响应中的模块名；不是存储路径 |
| `endpoint` | 必填 HTTPS URL，只匹配该 origin/pathname，允许请求附带 query |
| `storageKey` | 必填 util Storage 键，例如 `@ExampleOrg.Weather.Settings` 或独立根键 |
| `fields` | 非空字段数组，key 为安全的点分路径，不允许重复或父子重叠路径 |
| `requestHeader` | 默认 `X-Settings-Client`，同源页面请求须传值 `1`；可指定自己的专用 header |
| `resolveSettings(stored)` | 可选同步函数，每次 GET 计算有效配置；默认直接使用已存配置 |

工厂校验配置并快照字段定义。HTTP 请求只检查外部输入，后端存储异常和 resolver 异常向调用方抛出，不吞掉错误。空数组、false、0、空字符串保持原值，不会悄悄回退成默认值。

## 页面请求

```js
const result = await fetch("/settings/api/Weather", {
  method: "POST",
  credentials: "omit",
  headers: { "X-Settings-Client": "1", "Content-Type": "application/json" },
  body: JSON.stringify({ values: { "alerts.enabled": false } })
});
if (!result.ok) throw new Error((await result.json()).error);
```

HEAD 返回 200 和空正文，不读写存储。GET 返回 `{ module, fields, values }`，其中 values 用字段 key 作为扁平键；未配置且未声明 defaultValue 的字段不会出现在 JSON values 中。POST 接受部分字段，完整校验后只写一次，返回 `{ saved: true }`。写入前重新读取存储，保留未展示字段、其他模块及缓存；并发请求之间的原子性由 util 后端决定，本包不保证跨脚本事务。

状态码：403（缺少页面标记或异源）、400（非法 JSON、未知字段/值）、413（超过 65536 个 UTF-16 code units）、415（非 JSON）、405（非 HEAD/GET/POST）、500（Storage 返回写入失败）。标量字符串最多 2048 code units；数组为不重复的字符串、有限数值或布尔值，可由 options 进一步约束。错误消息为英文，UI 可自行本地化。

这不是通用公开网络服务：仅用于同源静态页面访问本机代理 Mock API。自定义 header 是请求来源约束，不是用户认证，也不是秘密；不会添加跨域许可，不提供 OPTIONS 预检放行，不暴露凭据。宿主正常拦截/缓存/MITM 配置由调用方负责。

## 参数优先级

本包不自动把 Storage 切换成 PersistentStore，也不改 `globalThis.$argument`。已有项目若默认 argument 优先，需要在接入时明确决定本地页面的设置如何生效；仅把值写入持久化键并不保证覆盖模块参数。

可沿用项目的 `getStorage` 消费者，通过 resolver 每次 GET 读取实际有效值：

```js
import getStorage from "@nsnanocat/util/getStorage.mjs";
const handler = createSettingsHandler({
  module: "Weather", endpoint: "https://example.org/settings/api/Weather",
  storageKey: "@ExampleOrg.Weather.Settings", fields,
  resolveSettings: () => getStorage("ExampleOrg", "Weather", database).Settings
});
```

`getStorage` 本身具有项目存储契约，只有已使用该契约的项目才需要此 resolver；其他项目直接使用持久化值即可。POST 不持久化 resolver 派生值或字段默认值，只存储显式提交的变更。

具体例子：本地存储 `enabled=false`，但模块参数 `enabled=true` 且 argument 优先，插件实际执行的是 true。不传 `resolveSettings`，GET 会展示存储中的 false；传入返回 `getStorage(...).Settings` 的函数后，GET 才展示实际生效的 true。它不是另一套存储，不负责写入，也不能让网页保存值自动越过模块参数优先级。函数接收当前持久化对象，仅在 GET 时调用；HEAD 和 POST 不调用它。

## 环境与打包

沿用 FlatBufferRoot 的 ESM 包模式，`files` 只包含入口、lib、类型，以及 npm 自动包含的 README/LICENSE/package.json。没有 CommonJS 兼容层。Node.js 通过 util 的 Storage 条件导出使用文件后端；代理脚本请用 Rollup 等工具打包，并选择默认/import 导出条件，不能将 Node 存储后端打进 JavaScriptCore。Quantumult X 的 `$done` 响应形状与 Surge 不同，继续复用项目已有的 util `done` 调用方式。

```sh
npm ci --registry=https://registry.npmjs.org/ --@nsnanocat:registry=https://registry.npmjs.org/
npm run build
npm run check
npm pack --dry-run
```

验证会覆盖 schema、部分更新、跨组织存储隔离、错误行为、代理存储和 Node.js 入口。当前业务仓库没有改成依赖本包；评审通过并发布后再迁移。

## 双平台发布（未执行）

与 util 一样使用两个 `v*` tag workflow：`release-package-to-npm.yml` 和 `release-package-to-github.yml`。分支 push 和 PR 只运行 CI，不发布。两条发布链均把版本从 tag 同步至 package.json，然后安装依赖、构建、lint/typecheck/test。稳定版使用 latest，预发布使用 beta/alpha 等首段 dist-tag。

两端显式指定发布 registry，package.json 只设置 access 而不固定 registry，避免 GitHub Packages 被误投到 npm。npm 使用 OIDC（需 npm >=11.5.1 和 Node >=22.14），GitHub Packages 只在发布步传 GITHUB_TOKEN。现阶段已建立代码仓库，但没有 tag、release、trusted publisher、token 或包发布操作。

NSNanoCat/PreferencePanes 远端已按用户要求创建为 public。包发布仍待评审确认。npm Trusted Publisher 配置入口位于具体包的 Settings，通常要先完成新包的首次发布，使包存在，再绑定组织、仓库和 workflow；不是注册 npm 账号后就自动获得发布信任。GitHub Packages 不同：仓库 workflow 的 `packages: write` 和 `GITHUB_TOKEN` 可以预先配置并用于首次发布，包创建后再核对包可见性和继承权限。

参考：[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)、[GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)。
