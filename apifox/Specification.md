# PreferencePanes 0.9.0 form API 规范

## 职责

业务仓库按版本发布 BoxJS JSON 与必要的配置 Mock 响应，模块安装配置 Mock 和 PreferencePanes latest Release 的 api.js。PreferencePanes 负责设置页生成、展示、导航、页面容器和 util 存储桥接；api.js 不包含业务配置或存储根映射。项目网站仅维护定制主页、入口 HEAD 探测、导航静态组件与 CSS/图标，不托管模块页面和读写脚本，也不需要独立设置插件。

## 接口

| HTTP 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /settings/{module} | 通用模块页，JSON/CSS 动态导入 |
| HEAD、GET | /configs/{module} | 业务模块提供的版本化 JSON Mock |
| POST | /api/get | 读取完整存储键或子树 |
| POST | /api/set | 替换完整存储键处的值 |
| POST | /api/delete | 删除键或子树 |

旧 /api/{module}/{path} 接口移除。get/set/delete 都是 POST，避免 GET 请求体在浏览器中不可用。API 不鉴权，不要求 X-Settings-Client、Origin、token 或 BoxJS 配置；实际读写在已安装代理脚本的本地环境完成。

## Form 正文

Content-Type 为 application/x-www-form-urlencoded，正文必须恰好一个字段。字段名是完整 @root.path，至少包含存储根和一个子键。根与路径使用字母、数字、下划线、连字符，各段以点分隔；拒绝原型属性名及空路径段。字段名和值按标准 form 编码，空格用 + 或 %20，内容中的 +、&、= 必须编码。

读取：

```http
POST /api/get
Content-Type: application/x-www-form-urlencoded

%40BiliBili.Enhanced.Settings.Home.Top_left=
```

写入普通文本，结果是字符串 mine：

```http
POST /api/set
Content-Type: application/x-www-form-urlencoded

%40BiliBili.Enhanced.Settings.Home.Top_left=mine
```

值若是合法 JSON，则保留对应类型；否则作为普通字符串。前端统一使用 JSON.stringify(value) 后再用 URLSearchParams 编码，因此字符串 "true" 与布尔 true、字符串 "0" 与数值 0 不混淆。JSON 对象/数组/null 都可以写入，不做控件或枚举校验，不合并补丁对象。

```js
const body = new URLSearchParams([["@BiliBili.Enhanced.Settings.Home.Switch", JSON.stringify(false)]]);
await fetch("/api/set", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
```

删除字段值留空。清理 Caches 使用 @BiliBili.Enhanced.Caches，重置模块使用 @BiliBili.Enhanced；保留同根的其它模块。不存在的键删除也返回 200。不支持直接删除整个存储根。

## 持久化与响应

Store 每次操作通过 util Storage 读取当前根对象，用 util Lodash 定位子路径；set/delete 修改后写回一次。保留旧存储中 JSON 字符串中间节点的解码，读取字符串叶子不改变其类型。API 不下载 BoxJS，不保存鉴权状态，没有预置允许模块目录。

get 成功返回原始 JSON 值，缺失返回 404。set 返回 {"saved":true}，delete 返回 {"deleted":true}。200 后前端更新当前页面缓存并显示临时通知；不追加读取。400 表示 form/路径或大小错误（正文至多 65536 字符），405 表示非 POST，415 表示正文类型错误，500 表示存储错误。所有响应 no-store。

## 模块页输入与导航

配置 Mock 的 HEAD/GET 响应通过 X-PreferencePanes-Version 提供业务版本。ModuleStatus 共用组件仅发送 HEAD，固定状态行显示“检测中”、业务版本或“未安装”；HTTP 200 但缺少版本头时显示“版本未知”。该版本由业务模块构建提供，不是 PreferencePanes 版本。

JSON/CSS 资源 URL 可通过 json/css 查询参数，或 X-PreferencePanes-JSON / X-PreferencePanes-CSS Header 传入；Header 分别优先。缺省 JSON 为 /configs/{module}，缺省 CSS 为空，使用内置样式。资源只接受 HTTP(S) 或相对地址。浏览器读取 JSON 后根据完整字段 ID 推导存储根与路径，生成 form 请求。

ModuleFrame 在 iframe 元素上保留请求上下文，HTML 原样加载，不根据 about:srcdoc 猜模块，也不补丁式改写返回 HTML。Navigation 统一管理历史、左右切换、滚动保留与退出取消；嵌入布局由框架处理，模块通过事件向常驻顶栏报告状态。

每次进入或刷新模块读 JSON/CSS 并读取设置一次；二级多选返回复用内存缓存。修改立即生效；Caches 按需读取，删除和重置后不额外 GET。主页仅 HEAD 对应配置，不读取存储。

查看缓存、清空缓存、重置模块收敛到标题栏右侧 ActionMenu。ModuleFrame 的导航状态包括 actions 描述，宿主只调用 perform(id)；模块接收操作事件并使用现有 get/delete 接口执行。写入或维护操作进行时菜单和返回按钮禁用。缓存展示为导航子页，返回不重读设置；清空与重置保留确认步骤。

## 发布

api.js 及公共 HTML/JS 由 PreferencePanes 的 Release 工作流发布。业务模块引用 https://github.com/NSNanoCat/PreferencePanes/releases/latest/download/api.js，自动更新遵循代理工具的缓存周期。业务仓库不生成 settings.bundle.js；网站不发布 API 或模块渲染产物。必须先发布该通用 API，再上线引用它的新模块模板。
