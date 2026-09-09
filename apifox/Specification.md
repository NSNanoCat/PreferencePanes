# PreferencePanes 0.6.0 接口规范（Specification）

前端负责 BoxJS 解析、控件生成和字段输入校验。API 只桥接安装配置指定的持久化根与模块，不下载 BoxJS，不校验字段声明、枚举或控件类型。

## 页面与资源归属

完整 HTML、主菜单、导航、控件、CSS 与独立代理执行端均由 PreferencePanes 提供。独立 PreferencePanes 代理模块统一安装页面与 /api/ 规则，安装映射的 module 可为允许访问的模块名数组。业务插件只提供 /configs/{module} 的 BoxJS Mock，不安装页面或 API 规则。托管仓库维护菜单、图标、安装映射和独立模块下载文件。

主菜单每次进入仅 HEAD /configs/{module}，不通过 API 可达性判断设置入口。独立通用模块不得接管 /configs/ 或替已关闭的插件响应配置。打开页面后只有成功读取并解析有效 BoxJS 才请求设置子树；配置缺失或无字段时不生成表单、不请求存储 API。HEAD 只能检查 HTTP 状态，正文有效性由打开时的 GET 校验。

有原生远程 Mock 的平台直接返回 JSON；其它平台使用包内 dist/preference-panes.config.js 生成仅返回 BoxJS 的配置响应脚本。它没有持久化读写或网络下载能力，只由业务插件的配置 Mock 规则安装。

根菜单读取 /settings/assets/site.boxjs.json。其中 name、icon、iconDark、sectionTitle、desc 声明品牌与说明，apps[].module 声明模块路径，apps[].name/icon/iconDark 声明入口展示，stylesheets 可加载业务站点的外部 CSS。菜单定义在当前文档内缓存，各模块可用性每次进入重新 HEAD 探测。实际字段继续由 /configs/{module} 的 BoxJS 生成，不写在菜单 JSON 或 HTML 中。

有原生 Mock 的平台直接按规则返回页面和配置文件。其它平台使用站点安装 JSON 的 resources（pattern/source/contentType）声明同样的资源映射。站点生成的脚本是预构建运行时加 PreferencePanes.runPreferences(安装映射)，不需要 $argument；由包内部完成宿主适配、下载与响应。API 仍委托 SettingsHandler，仅资源路径触发网络请求。资源下载源与 Mock 拦截地址分离。

## 路径和参数

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | /settings/{module} | 同一个 WebView 页面，按路径选择模块 |
| HEAD、GET | /configs/{module} | 模块配置 Mock：探测、加载 BoxJS |
| HEAD、GET、POST、DELETE | /api/{module}/ | 探测路由、读取、替换或删除整个模块 |
| HEAD、GET、POST、DELETE | /api/{module}/{path} | 探测路由、读取、替换或删除任意键或子树 |
| GET、DELETE | /api/{module}/Caches | 查看、清空模块缓存，使用相同的通用存储处理器 |

module 和 path 使用 Apifox 路径参数，不预填业务示例。path 以 / 分隔层级，每段独立编码；不能把分隔斜线编码为 %2F。片段允许字母、数字、下划线、连字符，拒绝空片段及 __proto__/prototype/constructor。这些是路径结构校验，不是 BoxJS 字段校验。API 接受不存在于 BoxJS 中的新键。

## 安装配置决定存储映射

代理入口构造：

~~~js
const handler = new SettingsHandler({
  origin: "https://biliverse.github.io",
  storageKey: "BiliBili",
  module: "Enhanced"
});
const response = await handler.handle($request);
~~~

此处由已安装插件提供可信配置，不经浏览器 header/body 提供。API 从 /api/ 后第一段确认模块，再将路径映射到固定存储根：

~~~text
/api/Enhanced/Settings/Home/Top_left → BiliBili.Enhanced.Settings.Home.Top_left
/api/Enhanced/Caches                → BiliBili.Enhanced.Caches
/api/Enhanced/                      → BiliBili.Enhanced
~~~

Enhanced 处理器不能访问 BiliBili.Global；重置 Enhanced 也保留 Global。类不接受 configURL、loadConfig 或 resolveSettings。通用独立代理脚本的 argument 为 origin、storageKey、module。配置 Mock 的实际下载源仍由模块模板指定，与 API 无关。

## 前端读取与缓存

每次进入主菜单，并发 HEAD /configs/{module}，仅 200 启用按钮；此时不 GET 设置。配置 Mock 地址不部署同名线上文件，静态下载源另设路径。

每次打开、再次进入或刷新设置页面：
1. GET /configs/{module} 一次，由前端解析 BoxJS、生成控件和默认值。
2. GET BoxJS 字段公共子树一次，例如 /api/Enhanced/Settings/。
3. 在当前页面建立内存缓存。若子树缺失返回 404，则用空覆盖值加 BoxJS 默认值绘制；兼容旧存储中以 JSON 字符串编码的设置子树。

保存或删除只按目标路径发送一次请求，根据是否返回 200 显示短暂通知；失败保留缓存及未保存输入。成功后仅更新内存，不 GET 整个模块。仅前端校验控件类型和选项；直接调用 API 可写入任何合法 JSON 值。

0.3.1 页面交互修正：修改控件立即 POST，按输入顺序串行写入，不需要保存按钮；单键 DELETE 仍是 API 能力，页面不展示逐项“删除覆盖值”。单选使用下拉框，多选从摘要行进入二级页，每次勾选立即写入；历史前进/后退只切换视图，保留主列表滚动位置与缓存，不重新 GET。请求失败提示并恢复该项的已保存值，不覆盖该项较新的输入或其它正在编辑的字段。

## 读写示例

~~~http
GET /api/Enhanced/Settings/Home/Top_left
X-Settings-Client: 1
~~~

已有值返回 200，正文是该值本身。GET 父路径返回全部子树，包括未在页面展示的键；不存在返回 404。不会自动合并 BoxJS 默认值。

~~~http
POST /api/Enhanced/Settings/Home/Top_left
Content-Type: application/json
X-Settings-Client: 1

"mine"
~~~

正文允许字符串、数字、布尔值、null、任意数组和对象；没有 values 包装。POST 替换指定位置的值而非合并对象。未存在的父节点会创建，JSON 数组元素可通过数字路径访问。路径之外的数据保持不变。

~~~json
{ "saved": true }
~~~

~~~http
DELETE /api/Enhanced/Settings/Home/Top_left
X-Settings-Client: 1
~~~

删除键或整棵子树，不存在时也返回 200。前端删除设置覆盖值后显示当前 BoxJS 默认值。

~~~json
{ "deleted": true }
~~~

## Caches 与模块重置

“查看 Caches”按需 GET /api/{module}/Caches，显示全部缓存 JSON；404 表示暂无缓存。再次点击刷新才重新读取，不在进入页面时自动下载缓存。

“清空 Caches”确认后 DELETE /api/{module}/Caches，仅删除该节点，保留 Settings 及其它模块。成功后清空当前缓存视图，不追加 GET。

“重置模块”确认后 DELETE /api/{module}/，删除模块的 Settings、Caches 和其它全部持久化键，保留同根的其它模块。成功后清除页面覆盖值、使用已加载 BoxJS 的默认值，隐藏旧缓存内容，不重新读取设置。再次进入页面时按正常打开流程读取。

~~~http
DELETE /api/Enhanced/
X-Settings-Client: 1
~~~

## 代理存储操作

HEAD 仅确认本处理器接管合法模块路径，不读取存储，也不证明已有值。GET 读取一次根；POST/DELETE 写入前读取最新根，使用 util Lodash 修改对应节点并写回一次。API 不发送网络请求。

历史 JSON 字符串中间节点会在路径遍历时解码；GET 直接指向字符串叶子时保留字符串。无法继续遍历标量父节点返回 500，不悄悄覆盖原数据。DELETE 数组元素采用删除键语义，不移动其它索引。

API 响应带 Cache-Control: no-store。默认需要 X-Settings-Client: 1，Origin 存在时须与安装来源一致；该请求头是页面标记，不是认证凭据。POST 正文上限为 65536 个 UTF-16 code units。多个代理脚本同时写同一根仍没有事务隔离保证。

| 状态码 | 含义 |
| --- | --- |
| 200 | 探测或读写成功；HEAD 无正文 |
| 400 | 路径或 JSON 正文格式无效 |
| 403 | 缺少页面标记，或请求来源不符 |
| 404 | 模块不由当前处理器接管，或 GET 目标不存在 |
| 405 | 不支持的 HTTP 方法 |
| 413 | POST 正文过长 |
| 415 | POST 正文不是 application/json |
| 500 | 存储读取、路径遍历或写入失败 |

API 不再返回 BoxJS 配置加载错误 502。配置 Mock 失败的格式仍由代理或原站决定。

## BoxJS 仅用于 WebView

支持 settings 数组、单 app 和 apps 订阅。字段 ID 仍使用 @根.模块.路径；名称、type、val、items、desc 生成控件，placeholder/rows/autoGrow 控制文本输入展示。app 元数据用于页面标题、说明和图标，script 只保留不执行；icons[0]/icons[1] 是透明/彩色变体，不是亮暗顺序。

浏览器解析的根名仅为配置信息；代理不会因此改变固定 storageKey。插件作者应让 BoxJS 路径与安装映射一致。设置默认值、类型与枚举都由 WebView 处理，API 本身与 BoxJS 无关。

GitHub main/dev 分别绑定 Apifox 同名分支。修改 apifox/preference-panes.apifox.json 后由已绑定数据源导入，并按分支回读验证。
