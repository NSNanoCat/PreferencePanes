import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const moduleId = 8522462;
const guide = await readFile(path.join(root, "apifox/guide.md"), "utf8");
const scalar = { oneOf: [{ type: "string", maxLength: 2048 }, { type: "number" }, { type: "boolean" }] };
const value = { oneOf: [...scalar.oneOf, { type: "array", items: scalar, uniqueItems: true }] };
const errorSchema = { type: "object", required: ["error"], properties: { error: { type: "string" } } };
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
  404: "未知字段或无值",
  413: "正文过长",
  415: "非 JSON 正文",
  500: "存储写入失败",
};
const names = { head: "探测指定配置键", get: "读取指定配置键", post: "写入或修改指定配置键", delete: "删除指定配置键" };
const ids = { head: 511372916, get: 511372917, post: 511372918, delete: 511372919 };
const apis = Object.keys(names).map((method) => {
  const success = method === "post" || method === "delete" ? 204 : 200;
  const codes = [success, 400, 403, 404, ...(method === "post" ? [413, 415, 500] : method === "delete" ? [500] : [])];
  return {
    id: String(ids[method]),
    method,
    path: "/api/Enhanced/Settings/Home/Top_left",
    type: "http",
    moduleId,
    serverId: "default",
    visibility: "SHARED",
    status: "testing",
    tags: ["配置键值"],
    operationId: `preference_panes_${method}`,
    sourceUrl: "https://github.com/NSNanoCat/PreferencePanes/blob/dev/lib/settings-handler.mjs",
    description: `这是一个具体的 database 叶子路径示例，不是唯一固定接口。只有 /api/ 固定，其后映射到 Enhanced.Settings.Home.Top_left。示例 origin=https://example.org、storageKey=BiliBili。未部署公网服务，请先配置代理实例。\n\n${method === "post" ? '正文直接是 JSON 字符串 "mine"，没有 values 包装。成功 204 无正文。' : method === "get" ? '返回键值本身，比如 "mine"；不返回模块或字段列表。' : method === "delete" ? "无需请求体，删除路径对应的持久化覆盖值。成功 204；重复删除幂等。" : "200 表示字段已声明，不读写存储；未知字段404。所有 HEAD 响应无正文。"}\n\n旧 /settings/api/{module} 契约已移除，旧接口资源请在 Apifox 单独检查，不自动删除。\n\n${guide}`,
    parameters: { path: [], query: [], cookie: [], header: headers },
    requestBody:
      method === "post"
        ? {
            type: "application/json",
            required: true,
            parameters: [],
            jsonSchema: {
              type: "string",
              enum: ["mine", "videoshortcut"],
              description: "本例 Top_left 的值。通用处理器支持其他类型，具体由 fields 声明。",
            },
            data: '"mine"',
          }
        : { type: "none", required: false, parameters: [] },
    responses: codes.map((code) => ({
      id: `pp-path-${method}-${code}`,
      code,
      name: code === success ? "成功" : descriptions[code],
      headers: [],
      contentType: method === "head" || code === 204 ? "noContent" : "json",
      jsonSchema: method === "head" || code === 204 ? {} : code === 200 ? value : errorSchema,
      description: code === 204 ? "操作完成，无正文" : method === "head" ? "无正文" : "JSON 响应",
    })),
    responseExamples: method === "get" ? [{ name: "读取 Top_left", responseId: "pp-path-get-200", data: '"mine"' }] : [],
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
    description: "按 database 路径的键值接口（包未发布）",
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
      id: 95176128,
      name: "配置键值（database 路径）",
      moduleId,
      parentId: 0,
      serverId: "default",
      description: "仅固定 /api/，后续每段对应数据对象的键。",
      visibility: "SHARED",
      auth: {},
      securityScheme: {},
      preProcessors: [],
      postProcessors: [],
      inheritPreProcessors: {},
      inheritPostProcessors: {},
      items: apis.map((api) => ({ name: names[api.method], api })),
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
    path: apis[0].path,
    writeBody: '"mine"',
    responseDefinitions: apis.reduce((n, api) => n + api.responses.length, 0),
  }),
);
