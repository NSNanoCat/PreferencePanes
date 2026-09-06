# PreferencePanes：先看这份说明

这是一个尚未发布的 JavaScript 工具包，不是已经运行在公网的设置服务器。它把代理插件的设置“读、写、检测”统一成一个处理器。页面继续由 argument 配置生成，不需要给每个选项分别写读写函数。

## 在 Apifox 看什么

左侧三个 HTTP 接口使用同一个示例地址 `https://example.org/settings/api/Weather`：

| 操作 | 你可以理解为 | 实际效果 |
| --- | --- | --- |
| HEAD 设置健康探测 | 插件在不在 | 返回 200 和空正文；不读写存储 |
| GET 读取设置字段和值 | 打开设置页 | 返回模块名、字段说明、选项和当前值 |
| POST 保存设置补丁 | 点击保存 | 校验你提交的字段后写入本地存储 |

`example.org` 是文档占位域名，没有部署这个服务。Apifox 的请求示例用于说明契约，不应误认为点击“发送”即可访问公网 PreferencePanes 服务。要调试真实请求，先在你的代理脚本中实例化处理器，并把示例域名和路径改为对应的真实拦截地址。

## 包的 JavaScript API

`createSettingsHandler(options)` 在脚本内部调用，它不是 HTTP 接口，所以没有伪造一个“创建处理器” POST 接口。

```js
import { createSettingsHandler } from "@nsnanocat/preference-panes";

const handle = createSettingsHandler({
  module: "Weather",
  endpoint: "https://example.org/settings/api/Weather",
  storageKey: "@ExampleOrg.Weather.Settings",
  fields: [
    { key: "alerts.enabled", name: "天气预警", type: "boolean", defaultValue: true },
    { key: "language", name: "语言", type: "string", defaultValue: "zh", options: [
      { key: "zh", label: "中文" },
      { key: "en", label: "English" }
    ] }
  ]
});
```

| 配置项 | 必填 | 直观解释 | 示例 |
| --- | --- | --- | --- |
| module | 是 | 页面上这个模块叫什么；不是存储路径 | Weather |
| endpoint | 是 | 代理脚本要接管哪个 HTTPS 接口 | https://example.org/settings/api/Weather |
| storageKey | 是 | util 把设置放在哪里 | @ExampleOrg.Weather.Settings |
| fields | 是 | 页面有哪些选项、类型和默认值 | 从 argument config 整理出的字段数组 |
| requestHeader | 否 | 设置页携带的专用标记，默认 X-Settings-Client，值为 1 | X-Settings-Client: 1 |
| resolveSettings | 否 | GET 时告诉页面“最终真正生效”的设置是什么 | 返回现有 getStorage(...).Settings |

**endpoint 是一个具体地址，不是路由模板。** 文档里的 `{module}` 只是展示不同模块的方式。一个处理器实例只处理自己的 origin/pathname，另一个模块地址直接返回 undefined，让外层逻辑继续处理；不存在自动代理所有模块的逻辑。

## resolveSettings 到底干什么

例如你在本地保存了 `alerts.enabled=false`，但代理模块 argument 仍是 `true`，且该模块让 argument 优先。插件实际上按 `true` 工作。

- 不传 resolveSettings：GET 展示本地存储的 false。
- 传入返回有效配置的函数：GET 展示真正生效的 true。

它只影响 GET 展示值，不写入、不切换优先级、不把网页保存值变成最高优先级。HEAD 和 POST 不调用这个函数。没有多来源配置合并需求时，不传即可。

```js
import getStorage from "@nsnanocat/util/getStorage.mjs";
// options 是上面的配置对象，database 是现有插件的默认配置。
const handle = createSettingsHandler({
  ...options,
  resolveSettings: () => getStorage("ExampleOrg", "Weather", database).Settings
});
```

## 从页面到 util 的数据流

```text
argument config 的字段定义
  -> fields
  -> GET 返回字段和值
  -> 页面按类型统一绘制
  -> POST {values:{"alerts.enabled":false}}
  -> 完整校验后 Lodash.set + Storage.setItem
  -> 对应模块下一次读取该存储键
```

HTTP values 使用扁平的字段 key，例如 `alerts.enabled`。util 的存储对象中是嵌套的 `alerts: { enabled: false }`。POST 只更新提交的字段，保留隐藏字段、其他模块和缓存；不会擅自存储 GET 的默认值或 resolver 派生值。false、0、空字符串和空数组不会被当作“没填”。

## 字段约束与错误

- 支持 boolean、number、string、array；数组元素仅支持字符串、有限数值和布尔值。
- 配置字段 key 必须是安全点路径；不允许重复 key、父子重叠 key 或 __proto__/constructor/prototype 路径。
- POST 只接受已声明的 key，检查类型、options 与数组去重后再一次写入。
- 字符串最多 2048 个 UTF-16 code units；整个 JSON 请求正文最多 65536 个 UTF-16 code units，**不是字节数**。
- 工厂配置错误、resolver 异常或存储后端抛错会直接抛给调用方，不能把它们描述为已由包转换好的 HTTP 500。只有 Storage 返回 false 时包生成 500。

专用请求头不是登录凭据，也不是秘密。Origin 存在且不同源时拒绝；本包不开放 CORS，也不放行 OPTIONS 预检。宿主负责 $done 适配和 HTTPS MITM。

## 当前状态与文档同步

代码仓库：NSNanoCat/PreferencePanes，开发分支 dev；npm 和 GitHub Packages 尚未发布，当前不创建版本 tag。

原生文档 JSON 保存在同一仓库 `apifox/preference-panes.apifox.json`。Git -> Apifox 单向同步，Apifox 是阅读与调试入口；不配置 Apifox -> Git 自动备份。文档示例和错误说明以当前源码 `lib/settings-handler.mjs` 及测试为依据。
