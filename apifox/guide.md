# PreferencePanes：从入口探测到单键读写

本包尚未发布。下面的 Enhanced 只是路径示例，example.org 没有部署接口；各项目复用相同代码，从自己的 BoxJS JSON 生成设置界面。

## 通用路径契约

| 方法 | 相对路径定义 | 用途 |
| --- | --- | --- |
| GET | `/settings/{module}` | 通用 HTML 页面，按路径中的模块生成界面 |
| HEAD、GET | `/configs/{module}` | 探测配置 Mock、读取 BoxJS JSON |
| HEAD、GET | `/api/{module}/` | 探测读写路由、读取模块公开子树 |
| HEAD、GET | `/api/{module}/{path}` | 探测、读取模块内的键或子树 |
| POST、DELETE | `/api/{module}/{path}` | 修改、删除声明的单个键 |

`module` 是动态模块标识；`path` 是模块内的相对 database 路径，允许多级，用 `/` 分隔。`Settings/Home/Top_left` 只是 path 示例，Settings、Home 和键名都不固定。路径逐段编码，不能把分隔用的 `/` 整体编码为 `%2F`。页面、配置资源、持久化读写使用同一个 module；不是三个各自指定的模块参数，也不使用 query 参数。

例如 module=Enhanced、path=Settings/Home/Top_left 时，实际请求才是 `/api/Enhanced/Settings/Home/Top_left`。以下具体 URL、BoxJS 字段和返回值均为使用示例，不能当作通用接口的固定路径或枚举。

## 页面通过 module 选择配置

```http
GET /settings/Enhanced
```

通用页面从 `/settings/{module}` 路径读取模块标识，不读取 module 或 config 查询参数。渲染器按固定约定 GET `/configs/Enhanced`，读取返回的 BoxJS JSON，再动态生成设置项。改为 `/settings/Global` 就 GET `/configs/Global`，不修改 HTML。

module 必须与 BoxJS ID `@BiliBili.Enhanced.Settings.…` 中的 Enhanced 一致；它也对应持久化 `/api/` 后第一段。实际 BoxJS 文件地址由模块模板的 Mock 规则指定。页面路径只允许一个非空模块段，可带结尾斜线；模块名只允许英文字母、数字、下划线、连字符，禁止 __proto__/prototype/constructor。缺失模块段、多余路径段或非法模块名在页面显示错误，不发送配置或存储请求。

| 请求 | 响应方 | 内容 |
| --- | --- | --- |
| GET /settings/{module} | 公共 HTML Mock | 同一份通用设置页 |
| HEAD、GET /configs/{module} | 对应模块的配置 Mock | 配置可用性、BoxJS 静态 JSON |
| GET /api/{module}/ 或 /api/{module}/{path} | 通用代理读写脚本 | 当前持久化设置的公开子树或叶子值 |
| POST、DELETE /api/{module}/{path} | 同一个通用代理读写脚本 | 单键修改、删除 |

配置资源使用 `/configs/`，持久化接口使用 `/api/`，两种模板正则互不重叠，不依赖执行优先级。各业务项目用现有 argument config 生成器生成 BoxJS JSON。模块的 Mock 规则引用生成文件的下载源；通用读写脚本参数 configURL 引用同一版本资源进行校验。configURL 是代理脚本的模板参数，不是页面参数；页面仅用 module 按约定寻找配置 Mock。

业务主菜单独立于通用设置页，由调用项目提供模块链接；Biliverse 主菜单归 Enhanced。HTML 和通用 JS 不包含 Enhanced/Global 等目录或字段，本仓库尚未迁移 Biliverse。

## 一、主菜单只探测配置 Mock

每次进入业务主菜单，用通用 client.probe(module) 并发发送：

```http
HEAD /configs/Enhanced
HEAD /configs/Global
```

这些地址由各模块的 BoxJS Mock 提供。200 才启用入口；非 200、无响应或超时则禁用。HEAD 无正文，不读持久化存储、不执行通用读写脚本，也不证明读写脚本运行正常。

配置 Mock 地址不部署同名在线静态文件，下载源在另一个地址。页面只请求约定的配置 Mock 地址。

## 二、每次真正进入或刷新设置页

先 GET 根据 module 生成的 `/configs/Enhanced`，取得 BoxJS。可使用 settings 数组、单 app 或 apps 订阅。示例：

```json
[
  {
    "id": "@BiliBili.Enhanced.Settings.Home.Top_left",
    "name": "顶栏左侧", "type": "selects", "val": "mine",
    "items": [{ "key": "mine", "label": "我的" }, { "key": "videoshortcut", "label": "短视频" }]
  },
  { "id": "@BiliBili.Enhanced.Settings.enabled", "name": "启用", "type": "boolean", "val": true }
]
```

通用组件由 ID 解析出存储根 BiliBili 和公共子树 Enhanced.Settings，再读取一次：

```http
GET /api/Enhanced/Settings/
X-Settings-Client: 1
```

返回 HTTP 200 和公开字段的持久化覆盖值，例如：

```json
{ "Home": { "Top_left": "videoshortcut" } }
```

只返回 BoxJS 声明的字段，不泄露同根下的缓存和其它模块。没有任何覆盖值时返回 `{}`。页面用 BoxJS val 补充未设置字段，并创建新的内存缓存；不使用 localStorage/sessionStorage。返回主菜单不 GET，再次进入重新执行上述两次 GET。刷新当前模块页也重新读取；浏览器前进、后退恢复缓存页面时会重新读取当前 URL 的模块。

只有 `/api/` 固定；其它组织可以使用 `/api/Weather/Preferences/Units`。同模块必须使用一个存储根，并具有模块根以下的公共父路径，才能一次读取设置子树。控件支持 boolean/selects/checkboxes/text/textarea/number，不执行 BoxJS 脚本。

## 三、修改单个键

```http
POST /api/Enhanced/Settings/Home/Top_left
Content-Type: application/json
X-Settings-Client: 1

"mine"
```

正文就是 JSON 值本身，没有 values 包装。成功返回 HTTP 200：

```json
{ "saved": true }
```

组件显示“修改成功”，只更新内存中的该键。不会随后 GET 整个模块。非 200（包括 204）或网络错误显示“操作失败”，缓存保留原值，其它控件的未保存输入也保留。

代理执行端运行时读取 BoxJS 校验字段，然后读取最新存储根，通过 util set 修改该键并写回。不会把浏览器的整棵旧缓存覆盖回存储；只修改持久化数据，不修改源码 database.mjs 或 argument 配置。

## 四、删除覆盖值

```http
DELETE /api/Enhanced/Settings/Home/Top_left
X-Settings-Client: 1
```

没有正文。成功返回 HTTP 200：

```json
{ "deleted": true }
```

重复删除仍成功。代理通过 util unset 删除单键，保留同级字段、其它模块和缓存；不递归删除空父对象。浏览器显示“删除成功”，移除该键缓存的覆盖值，改用 BoxJS val；不追加 GET。删除覆盖值不等于关闭功能。

## 五、需要时直接查询单键

```http
GET /api/Enhanced/Settings/Home/Top_left
X-Settings-Client: 1
```

有覆盖值则返回 HTTP 200，正文直接为 `"mine"`；无值时 404。默认 GET 不返回 BoxJS 默认值。也支持 HEAD 完整叶子路径：声明过则 200，否则 404；不读取存储。主菜单应 HEAD 配置 Mock 地址，不是持久化叶子探测。

## 通用脚本参数与读取时机

| 参数或数据 | 来源与作用 |
| --- | --- |
| origin | 调用方的 HTTPS 页面来源，不带路径 |
| loadConfig(module) | 每次键值请求时加载 BoxJS，动态决定字段与写入校验 |
| storageKey | 从 BoxJS 的 @根键.模块.路径 提取，不通过 header 传递 |
| requestHeader | 默认 X-Settings-Client，值为 1；同源页面标记，不是认证凭据 |
| resolveSettings(stored, definition) | 可选 GET 有效配置解析器，返回完整 database 形状的对象；不参与 HEAD/POST/DELETE |

独立打包脚本通过 argument 的 origin/configURL 接收地址，用 util fetch 下载 BoxJS，用 util Storage/Lodash 读写。不同模块引用同一份脚本，分别配置自己的 /api/ 正则与校验 BoxJS 地址；/configs/ Mock 不经过此脚本。原生配置 Mock 与脚本应使用同一版本的配置源；代理自己的 Mock 资源缓存需要按代理机制更新。

每次 GET 持久化设置读根一次。每次 POST/DELETE 写入前重新读根，再单键修改、写回一次。浏览器缓存不触发额外 GET，但不能取消代理端保证保留其它数据所需的读改写。不同代理脚本同时写同一根键不具备事务隔离保证。

resolveSettings 可由模块按已有规则合并 database、argument、持久化值。默认不传时只读持久化值，页面使用 BoxJS 默认值补缺。本包不自动修改模块现有配置优先级；删除后不调用 resolver，下次进入/刷新才重新读取。

## 错误与限制

未知键 404；非法路径、类型或 JSON 400；缺标记或异源 403；整树写入及不支持的方法 405；正文过长 413；非 JSON 写入 415；配置源加载/解析失败 502；存储写入失败 500。POST 上限 65536 个 UTF-16 code units，字符串上限 2048。响应 no-store；HEAD 始终无正文。配置资源由原生 Mock 管理，其失败响应格式由代理或原站决定。

GitHub main/dev 分别绑定 Apifox 同名分支，JSON 路径为 apifox/preference-panes.apifox.json。提交 JSON 后仍需客户端执行数据源导入，并按分支回读确认结果。npm/GitHub Packages 未发布，Biliverse 消费端本轮未迁移。
