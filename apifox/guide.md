# PreferencePanes：按 database 路径读写

固定的路径层级只有 `/api/`。后面的每一段，都是 database 对象的一个键。包内不固定模块名、Settings 层级或组织名。

## 用 Enhanced 的例子看

`Enhanced/src/function/database.mjs` 中有这样的结构：

```js
{
  Enhanced: {
    Settings: {
      Home: { Top_left: "mine" }
    }
  }
}
```

因此，对应路径是：

```text
/api/Enhanced/Settings/Home/Top_left
```

### 写入或修改

```http
POST /api/Enhanced/Settings/Home/Top_left
Content-Type: application/json
X-Settings-Client: 1

"mine"
```

正文就是值本身。字符串 mine 在 JSON 线上编码中写为 `"mine"`；布尔值写 `true`，数值写 `1`，数组写 `["messages"]`。不再用 `{values:{...}}` 包裹。POST 为单键 upsert，成功返回 HTTP 204，无正文。

### 读取

```http
GET /api/Enhanced/Settings/Home/Top_left
X-Settings-Client: 1
```

成功返回 HTTP 200，JSON 正文直接为 `"mine"`，不是 `{module,fields,values}`。GET 读取当前持久化对象或 resolveSettings 返回的对象，再取 URL 对应的键；缺省时可以使用该字段的 defaultValue，仍无值则返回 404。

### 删除

```http
DELETE /api/Enhanced/Settings/Home/Top_left
X-Settings-Client: 1
```

无需正文，也无需 Content-Type。通过 util 删除该键的本地覆盖值，成功返回 HTTP 204。其他键、同级模块和缓存保留，空父对象不递归删除；重复删除仍成功。删除覆盖值后 GET 可能返回 defaultValue 或 resolver 的默认结果，删除不等于将功能关闭。

### 探测

```http
HEAD /api/Enhanced/Settings/Home/Top_left
X-Settings-Client: 1
```

已声明键返回 200，未声明键返回 404。HEAD 不读取存储、不调用 resolver，始终无正文；它确认该键的 API 能力，不证明该键已经保存过值。

## 通用组件如何配置

```js
import { createSettingsHandler, parseSettingsPath } from "@nsnanocat/preference-panes";

const handle = createSettingsHandler({
  origin: "https://example.org",
  storageKey: "BiliBili",
  fields: [
    {
      key: "Enhanced.Settings.Home.Top_left",
      name: "顶栏左侧按钮",
      type: "string",
      defaultValue: "mine",
      options: [
        { key: "mine", label: "我的" },
        { key: "videoshortcut", label: "短视频" }
      ]
    }
  ]
});

parseSettingsPath("https://example.org/api/Enhanced/Settings/Home/Top_left");
// ["Enhanced", "Settings", "Home", "Top_left"]
```

| 配置 | 意义 |
| --- | --- |
| origin | 调用方自己的 HTTPS 域名，不带路径；example.org 仅为文档示例，未部署公网服务 |
| storageKey | util 的持久化根键，比如 BiliBili；根键不自动添加进 HTTP 路径 |
| fields | 由 argument config 生成的字段；key 为相对于存储根的完整 database 点路径 |
| requestHeader | 可选页面专用标记头，默认 X-Settings-Client，值为 1；不是登录凭据 |
| resolveSettings | 可选 GET 有效配置解析函数，返回完整 database 形状的对象；不负责 POST/DELETE，不改变优先级 |

例如 argument config 原始 key 为 `Home.Top_left`，生成器可以统一加上调用方前缀：`args.map(field => ({ ...field, key: 'Enhanced.Settings.' + field.key }))`。该前缀是 Enhanced 的业务配置，不是本包内置规则。其它组织可以使用 `/api/Weather/Preferences/Units`，只要 fields 声明了对应路径。

一个处理器可声明多个模块的完整字段路径；如果不同插件分别部署，给各实例提供自己负责的 fields，模板也只匹配其责任范围。schema 用于页面生成和写入校验，页面需要的字段列表应由调用方提供，本包不为 schema 再引入固定的 settings 层级。

## 存储和错误

示例 POST 在 util 的 `BiliBili` 根对象下写入 `Enhanced.Settings.Home.Top_left`。包只修改持久化对象，不改源码文件、不改模块 argument、不自动切换 Storage。util 曾经把中间 Settings 对象保存成 JSON 字符串时，遍历会解码该对象并保留其余字段，写回时该分支为普通对象。

只操作 fields 声明的单个键；不开放任意未声明字段或整棵树覆写。未知键 404，非法路径/类型/JSON 400，缺标记或异源 403，非 JSON 写入 415，超长正文 413，其他方法 405，Storage 返回 false 时 500。POST 正文上限为 65536 个 UTF-16 code units，字符串上限 2048。存储或 resolver 的异常仍交给外层脚本处理。

## 文档与发布状态

代码与 Apifox 原生 JSON 保存在 NSNanoCat/PreferencePanes 仓库。GitHub main -> Apifox main，GitHub dev -> Apifox dev；文档源为 `apifox/preference-panes.apifox.json`。路径契约在未发布阶段直接调整，没有旧 `/settings/api/{module}` 兼容分支。npm/GitHub Packages 仍未发布，本轮没有迁移 Biliverse 消费端。
