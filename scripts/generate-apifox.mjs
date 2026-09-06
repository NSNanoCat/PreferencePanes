import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const moduleId = 8522462;
const guide = await readFile(path.join(root, "apifox/guide.md"), "utf8");
const scalar = { oneOf: [{ type: "string", maxLength: 2048 }, { type: "number" }, { type: "boolean" }] };
const value = { oneOf: [...scalar.oneOf, { type: "array", items: scalar, uniqueItems: true }] };
const fields = {
  type: "array",
  minItems: 1,
  description: "调用方提供的字段数组；不是从 HTTP 请求读取的 schema。",
  items: {
    type: "object",
    required: ["key", "name", "type"],
    properties: {
      key: { type: "string", description: "安全的点分路径，不允许重复、父子重叠或 prototype 相关路径。", examples: ["alerts.enabled"] },
      name: { type: "string", description: "页面显示名称" },
      type: { type: "string", enum: ["boolean", "number", "string", "array"] },
      defaultValue: { ...value, description: "可选默认值，必须符合该字段 type 与 options；未配置时省略。" },
      description: { type: "string", description: "可选说明" },
      options: {
        type: "array",
        description: "可选枚举，key 必须唯一；值须匹配其中一项。",
        items: { type: "object", required: ["key", "label"], properties: { key: scalar, label: { type: "string" } } },
      },
    },
  },
};
const exampleFields = [
  { key: "alerts.enabled", name: "天气预警", type: "boolean", defaultValue: true },
  {
    key: "language",
    name: "语言",
    type: "string",
    defaultValue: "zh",
    options: [
      { key: "zh", label: "中文" },
      { key: "en", label: "English" },
    ],
  },
];
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
const commonHeaders = [
  header("X-Settings-Client", "1", "默认页面专用标记；如果实例配置了 requestHeader，需替换此名称。不是登录鉴权。", true),
  header("Origin", "https://example.org", "可省略；存在时必须与 endpoint 的 origin 完全相同。"),
];
const responseHeaders = [
  header("Content-Type", "application/json; charset=utf-8", "响应类型"),
  header("Cache-Control", "no-store", "配置响应不缓存"),
  header("X-Content-Type-Options", "nosniff", "禁止类型嗅探"),
];
const errorSchema = {
  type: "object",
  required: ["error"],
  properties: { error: { type: "string", description: "英文错误说明；页面可自行本地化。" } },
};
const apiSchema = {
  head: undefined,
  get: {
    type: "object",
    required: ["module", "fields", "values"],
    properties: {
      module: { type: "string", description: "调用方配置的模块名" },
      fields,
      values: {
        type: "object",
        description: "以字段 key 为扁平键的有效值。缺省且无默认值的字段在 JSON 中省略。",
        additionalProperties: value,
      },
    },
  },
  post: { type: "object", required: ["saved"], properties: { saved: { type: "boolean", const: true } } },
};
const details = {
  head: [
    "设置健康探测",
    "成功返回 HTTP 200 和空正文，不调用 Storage 或 resolveSettings。请求头检查仍生效，未携带标记或 Origin 不符返回 403，HEAD 错误也没有正文。",
  ],
  get: [
    "读取设置字段和值",
    "每次 GET 通过 util Storage.getItem(storageKey) 读取；若配置了 resolveSettings，使用其同步返回的有效配置，否则使用已存值。Lodash.get 读取每个字段，缺省值由 defaultValue 提供。\n\n完整配置参数与读写流程如下。\n\n" +
      guide,
  ],
  post: [
    "保存设置补丁",
    "请求体为 {values:{...}}，values 至少一个字段。先完整校验所有字段后才读取并写入目标存储键。只更新本次提交的路径，保留隐藏字段与其他模块配置。不调用 resolveSettings，不自动切换 argument/PersistentStore 优先级。Storage.setItem 返回 false 才转换成 500；存储后端抛错由外层处理。",
  ],
};
const descriptions = {
  400: "无效 JSON / 空 values / 未声明 key / 类型或 options 不符 / 重复数组项",
  403: "缺少页面标记或 Origin 不符",
  413: "正文超过 65536 个 UTF-16 code units（不是字节数）",
  415: "Content-Type 不是 application/json",
  500: "Storage.setItem 返回 false，写入失败",
};
const examples = {
  get: { module: "Weather", fields: exampleFields, values: { "alerts.enabled": true, language: "zh" } },
  post: { saved: true },
};
const apis = ["head", "get", "post"].map((method) => {
  const codes = method === "head" || method === "get" ? [200, 403] : [200, 400, 403, 413, 415, 500];
  const responses = codes.map((code) => ({
    id: `pp-${method}-${code}`,
    name: code === 200 ? "成功" : descriptions[code],
    code,
    headers: responseHeaders,
    contentType: method === "head" ? "noContent" : "json",
    jsonSchema: method === "head" ? {} : code === 200 ? apiSchema[method] : errorSchema,
    description: method === "head" ? "HEAD 始终无响应正文。" : code === 200 ? "成功响应" : descriptions[code],
  }));
  return {
    id: `pp-${method}`,
    name: details[method][0],
    method,
    path: "/settings/api/{module}",
    type: "http",
    moduleId,
    serverId: "default",
    visibility: "SHARED",
    status: "testing",
    tags: ["设置读写"],
    operationId: `preference_panes_${method}`,
    sourceUrl: "https://github.com/NSNanoCat/PreferencePanes/blob/dev/lib/settings-handler.mjs",
    description:
      "这是 @nsnanocat/preference-panes 的实例化 HTTP 契约，不是已部署的公网服务。默认服务示例为 https://example.org；请配置实际 endpoint 后调试。{module} 是文档模板，一个处理器实例仅精确匹配配置的 origin/pathname。路径不匹配返回 undefined，不是由本包生成 404。非 HEAD/GET/POST 方法返回 405，Allow: HEAD, GET, POST。\n\n" +
      details[method][1],
    parameters: {
      path: [
        {
          id: "module#0",
          name: "module",
          type: "string",
          schema: { type: "string" },
          required: true,
          enable: true,
          example: "Weather",
          description: "示例模块；实际 endpoint 已在实例化时确定。",
        },
      ],
      query: [],
      cookie: [],
      header: commonHeaders,
    },
    requestBody:
      method === "post"
        ? {
            type: "application/json",
            required: true,
            parameters: [],
            jsonSchema: {
              type: "object",
              required: ["values"],
              properties: {
                values: {
                  type: "object",
                  minProperties: 1,
                  additionalProperties: value,
                  description: "只接受 fields 声明的 key；嵌套路径用 alerts.enabled 等扁平键。",
                },
              },
            },
            data: JSON.stringify({ values: { "alerts.enabled": false } }, null, 2),
          }
        : { type: "none", parameters: [], required: false },
    responses,
    responseExamples:
      method === "head"
        ? []
        : [
            { name: "调用方 Weather 实例的示例", responseId: `pp-${method}-200`, data: JSON.stringify(examples[method], null, 2) },
            ...(method === "post"
              ? [{ name: "未知字段示例", responseId: "pp-post-400", data: '{"error":"Unknown setting: unknown"}' }]
              : []),
          ],
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
  info: { name: "Preference Panes", description: "通用设置 API 评审文档（尚未发布包）", mockRule: { rules: [], enableSystemRule: true } },
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
      id: "pp-settings-folder",
      name: "设置读写（示例实例）",
      moduleId,
      parentId: 0,
      serverId: "default",
      description: "先打开 GET 接口说明，查看包的工厂参数与完整流程。示例域名不是线上服务。",
      visibility: "SHARED",
      auth: {},
      securityScheme: {},
      preProcessors: [],
      postProcessors: [],
      inheritPreProcessors: {},
      inheritPostProcessors: {},
      items: apis.map((api) => ({ name: api.name, api })),
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
    output,
    operations: apis.length,
    paths: 1,
    writeOperations: 1,
    withBody: 1,
    emptyObjectBodies: 0,
    responseDefinitions: apis.reduce((n, api) => n + api.responses.length, 0),
  }),
);
