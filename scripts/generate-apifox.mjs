import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const moduleId = 8522462;
const guide = await readFile(path.join(root, "apifox/guide.md"), "utf8");
const scalar = { oneOf: [{ type: "string", maxLength: 2048 }, { type: "number" }, { type: "boolean" }] };
const value = { oneOf: [...scalar.oneOf, { type: "array", items: scalar, uniqueItems: true }] };
const errorSchema = { type: "object", required: ["error"], properties: { error: { type: "string" } } };
const settings = {
  type: "object",
  additionalProperties: true,
  description: "动态子树：仅包含 BoxJS 声明且已有持久化值的字段；键名、层级和类型由模块配置决定。",
};
const boxjsFields = {
  type: "array",
  items: {
    type: "object",
    required: ["id", "name", "type"],
    properties: {
      id: { type: "string", description: "@存储根.模块.子路径.键" },
      name: { type: "string" },
      desc: { type: "string" },
      type: { type: "string", enum: ["boolean", "selects", "checkboxes", "text", "textarea", "number"] },
      val: value,
      items: {
        type: "array",
        items: { type: "object", required: ["key", "label"], properties: { key: scalar, label: { type: "string" } } },
      },
    },
  },
};
const boxjsApp = { type: "object", required: ["settings"], properties: { settings: boxjsFields } };
const boxjs = {
  oneOf: [boxjsFields, boxjsApp, { type: "object", required: ["apps"], properties: { apps: { type: "array", items: boxjsApp } } }],
};
const header = (name, example, description, required = false) => ({
  id: `${name}#0`,
  name,
  type: "string",
  schema: { type: "string" },
  required,
  enable: true,
  example,
  description,
});
const headers = [
  header("X-Settings-Client", "1", "默认页面标记，不是认证凭据；调用方可通过 requestHeader 改名。", true),
  header("Origin", "https://example.org", "存在时必须与配置的 origin 相同。"),
];
const descriptions = {
  400: "非法路径或 JSON 值",
  403: "缺标记或异源",
  404: "未知字段、无覆盖值或模块未启用",
  405: "不支持的操作",
  413: "正文过长",
  415: "非 JSON 正文",
  500: "存储写入或执行失败",
  502: "BoxJS 配置加载或解析失败",
};
const leaf = "/api/{module}/{path}";
const declarations = [
  {
    id: "pp-page-get",
    method: "get",
    path: "/settings/{module}",
    name: "打开通用设置页",
    group: "通用设置页面",
    mock: true,
    page: true,
    schema: {},
    example:
      '<!doctype html><html><body><main id="preferences"></main><script type="module">import { mountPreferencePanes } from "/resources/preference-panes.mjs"; mountPreferencePanes({ element: document.querySelector("#preferences") });</script></body></html>',
    description:
      "同一份 HTML 从 /settings/{module} 路径读取模块标识，按约定 GET /configs/{module} 取得 BoxJS 并生成设置界面。不使用查询参数。缺失、多余或非法路径段不发送请求。",
  },
  {
    id: "pp-config-head",
    method: "head",
    path: "/configs/{module}",
    name: "探测模块配置 Mock",
    group: "模块配置",
    mock: true,
    schema: {},
    example: undefined,
    description: "主菜单并发探测。模块的原生 BoxJS Mock 返回 200 才启用入口，不读取持久化设置。该路径没有线上静态文件。",
  },
  {
    id: "pp-config-get",
    method: "get",
    path: "/configs/{module}",
    name: "获取模块 BoxJS 配置",
    group: "模块配置",
    mock: true,
    schema: boxjs,
    example: [
      {
        id: "@BiliBili.Enhanced.Settings.Home.Top_left",
        name: "顶栏左侧",
        type: "selects",
        val: "mine",
        items: [
          { key: "mine", label: "我的" },
          { key: "videoshortcut", label: "短视频" },
        ],
      },
      { id: "@BiliBili.Enhanced.Settings.enabled", name: "启用", type: "boolean", val: true },
    ],
    description: "每次进入或刷新模块页先取一次配置，实时生成控件。从 ID 提取 storageKey，不使用浏览器传来的存储根键。",
  },
  {
    id: "pp-subtree-get",
    method: "get",
    path: "/api/{module}/",
    name: "读取模块公开子树",
    group: "持久化读写",
    schema: settings,
    example: { Settings: { Home: { Top_left: "videoshortcut" } } },
    description:
      "读取模块根下已声明字段的持久化覆盖值；无覆盖值返回空对象。页面通常通过 /api/{module}/{path} 读取 BoxJS 计算出的公共子树，不要求子树名为 Settings。",
  },
  {
    id: "pp-module-head",
    method: "head",
    path: "/api/{module}/",
    name: "探测模块读写路由",
    group: "持久化读写",
    schema: {},
    description: "通用脚本加载 BoxJS 确认模块具有声明字段，不读取存储；主菜单仍使用 HEAD /configs/{module} 探测配置 Mock。",
  },
  {
    id: "511372916",
    method: "head",
    path: leaf,
    name: "探测指定配置键",
    group: "持久化读写",
    schema: {},
    description: "读取配置确认字段已声明，不读写存储。主菜单 HEAD 配置 Mock 地址。",
  },
  {
    id: "511372917",
    method: "get",
    path: leaf,
    name: "读取指定键或子树",
    group: "持久化读写",
    schema: { oneOf: [...value.oneOf, settings] },
    example: "mine",
    description:
      "path 是模块内以 / 分隔的相对路径。叶子直接返回键值，无持久化值且未提供 resolver 时为 404；父路径返回已声明字段的覆盖值子树，无覆盖值返回 {}。不返回 BoxJS 默认值。",
  },
  {
    id: "511372918",
    method: "post",
    path: leaf,
    name: "写入或修改指定配置键",
    group: "持久化读写",
    schema: { type: "object", required: ["saved"], properties: { saved: { type: "boolean", enum: [true] } } },
    example: { saved: true },
    description:
      '正文直接是符合 BoxJS 字段类型的 JSON 值，例如 "mine"、true、42 或数组；不是补丁对象。仅允许写入完整叶子路径。成功返回 200 和 saved=true；客户端只更新该键缓存并显示通知，不追加 GET。',
  },
  {
    id: "511372919",
    method: "delete",
    path: leaf,
    name: "删除指定配置键",
    group: "持久化读写",
    schema: { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", enum: [true] } } },
    example: { deleted: true },
    description: "无正文，删除该持久化覆盖值。成功 200，重复删除幂等；客户端显示 BoxJS 默认值，不追加 GET。",
  },
];
const apis = declarations.map((entry) => {
  const { method, id } = entry;
  const codes = entry.mock
    ? [200, 404]
    : [200, 400, 403, 404, 405, 502, ...(method === "post" ? [413, 415, 500] : method === "delete" ? [500] : [])];
  return {
    id,
    method,
    path: entry.path,
    type: "http",
    moduleId,
    serverId: "default",
    visibility: "SHARED",
    status: "testing",
    tags: [entry.group],
    operationId: `preference_panes_${id}`,
    sourceUrl: "https://github.com/NSNanoCat/PreferencePanes/blob/dev/apifox/guide.md",
    description: `${entry.description}\n\n${guide}`,
    parameters: {
      path: [
        {
          id: "module#0",
          name: "module",
          type: "string",
          schema: { type: "string", pattern: "^[a-zA-Z0-9_-]+$", minLength: 1 },
          required: true,
          enable: true,
          example: "Enhanced",
          description:
            "模块标识：同一值用于 /settings/{module}、/configs/{module}、/api/{module}/…。对应 BoxJS ID 的 @存储根.模块.路径 中的模块段；Enhanced 仅为示例。",
        },
        ...(entry.path.includes("{path}")
          ? [
              {
                id: "path#0",
                name: "path",
                type: "string",
                schema: { type: "string", minLength: 1 },
                required: true,
                enable: true,
                example: "Settings/Home/Top_left",
                description:
                  "模块内的相对 database 路径，可有多级，用 / 连接各段。逐段编码，不要把分隔斜线编码为 %2F；POST/DELETE 必须指向 BoxJS 声明的叶子，GET/HEAD 也支持父路径。Settings 和 Home 均不是固定层级。",
              },
            ]
          : []),
      ],
      query: [],
      cookie: [],
      header: entry.mock ? [] : headers,
    },
    requestBody:
      method === "post"
        ? {
            type: "application/json",
            required: true,
            parameters: [],
            jsonSchema: { ...value, description: "值的具体类型及可选值由运行时 BoxJS 字段约束；不固定为字符串或某个模块的枚举。" },
            data: '"mine"',
          }
        : { type: "none", required: false, parameters: [] },
    responses: codes.map((code) => ({
      id: `pp-${id}-${code}`,
      code,
      name: code === 200 ? "成功" : descriptions[code],
      headers: [],
      contentType: method === "head" ? "noContent" : entry.page || (entry.mock && code !== 200) ? "html" : "json",
      jsonSchema: method === "head" || (entry.mock && code !== 200) ? {} : code === 200 ? entry.schema : errorSchema,
      description:
        method === "head"
          ? "无正文"
          : entry.mock && code !== 200
            ? "Mock 不可用时由代理或原站决定响应格式，不保证 JSON。"
            : entry.page
              ? "通用 HTML；通过页面路径 /settings/{module} 按约定读取 /configs/{module}。"
              : "JSON 响应",
    })),
    responseExamples:
      entry.example === undefined
        ? []
        : [{ name: entry.name, responseId: `pp-${id}-200`, data: entry.page ? entry.example : JSON.stringify(entry.example, null, 2) }],
    auth: {},
    securityScheme: {},
    commonParameters: {},
    preProcessors: [],
    postProcessors: [],
    inheritPreProcessors: {},
    inheritPostProcessors: {},
    cases: [],
    mocks: [],
    customApiFields: "{}",
    advancedSettings: { disabledSystemHeaders: {} },
    oasExtensions: "{}",
  };
});
const document = {
  apifoxProject: "1.0.0",
  $schema: { app: "apifox", type: "project", version: "1.2.0" },
  info: {
    name: "Preference Panes",
    description: "运行时 BoxJS、模块探测、页面初次读取与单键读写（包未发布）",
    mockRule: { rules: [], enableSystemRule: true },
  },
  projectSetting: {
    id: "8852249",
    auth: {},
    securityScheme: {},
    gateway: [],
    language: "zh-CN",
    apiStatuses: ["developing", "testing", "released", "deprecated"],
    mockSettings: {},
    preProcessors: [],
    postProcessors: [],
    advancedSettings: {},
    servers: [{ id: "default", name: "默认服务", moduleId }],
    cloudMock: {},
  },
  apiCollection: [
    {
      id: "pp-root",
      name: "根目录",
      moduleId,
      parentId: 0,
      serverId: "default",
      items: ["通用设置页面", "模块配置", "持久化读写"].map((group, index) => ({
        id: `pp-folder-${index}`,
        name: group,
        moduleId,
        parentId: 0,
        serverId: "default",
        description: group,
        visibility: "SHARED",
        auth: {},
        securityScheme: {},
        preProcessors: [],
        postProcessors: [],
        inheritPreProcessors: {},
        inheritPostProcessors: {},
        items: apis
          .filter((api) => api.tags[0] === group)
          .map((api) => ({ name: declarations.find((entry) => entry.id === api.id).name, api })),
      })),
    },
  ],
  moduleSettings: [{ id: String(moduleId), name: "默认模块", description: "", moduleVariables: [], openApiInfo: {} }],
};
for (const collection of [
  "socketCollection",
  "docCollection",
  "webSocketCollection",
  "socketIOCollection",
  "mcpClientCollection",
  "responseCollection",
  "schemaCollection",
  "securitySchemeCollection",
  "oasComponentCollection",
  "requestCollection",
  "apiTestCaseCollection",
  "testCaseReferences",
  "environments",
  "commonScripts",
  "databaseConnections",
  "globalVariables",
  "commonParameters",
  "customFunctions",
  "projectTestCaseCategories",
  "projectTestCaseTags",
  "projectAssociations",
])
  document[collection] = [];
const output = path.join(root, "apifox/preference-panes.apifox.json");
await mkdir(path.dirname(output), { recursive: true });
const json = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8")) !== json) throw new Error("Apifox JSON is stale");
} else await writeFile(output, json);
console.log(
  JSON.stringify({
    operations: apis.length,
    paths: new Set(apis.map((api) => api.path)).size,
    writes: apis.filter((api) => api.method === "post").length,
    withBody: apis.filter((api) => api.requestBody.type === "application/json").length,
    writeBody: '"mine"',
    responseDefinitions: apis.reduce((n, api) => n + api.responses.length, 0),
  }),
);
