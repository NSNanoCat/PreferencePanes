import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 从接口声明与规范生成 Apifox 原生文件；--check 只校验，不写文件。
 * Generate the native Apifox file from declarations and specification; --check validates without writing.
 * @module apifox/generate
 */
const root = path.resolve(import.meta.dirname, "..");
const moduleId = 8522462;
const specification = await readFile(path.join(root, "apifox/Specification.md"), "utf8");
const scalar = { oneOf: [{ type: "string", maxLength: 2048 }, { type: "number" }, { type: "boolean" }] };
const value = { oneOf: [...scalar.oneOf, { type: "array", items: scalar, uniqueItems: true }] };
const dataValue = { description: "任意 JSON 值；API 不按 BoxJS 校验类型或枚举，POST 替换路径处的完整值。", oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }, { type: "array", items: {} }, { type: "object", additionalProperties: true }] };
const errorSchema = { type: "object", required: ["error"], properties: { error: { type: "string" } } };
const boxjsFields = {
    type: "array",
    items: {
        type: "object",
        required: ["id", "name", "type"],
        properties: {
            id: { type: "string", description: "@存储根.模块.子路径.键" },
            name: { type: "string" },
            desc: { type: "string" },
            placeholder: { type: "string", description: "文本或数字输入框的占位提示" },
            rows: { type: "integer", minimum: 1, description: "textarea 的基础行数" },
            autoGrow: { type: "boolean", description: "textarea 随内容自动增长，缩短内容后回到基础行数" },
            type: { type: "string", enum: ["boolean", "selects", "checkboxes", "text", "textarea", "number"] },
            val: value,
            items: {
                type: "array",
                items: { type: "object", required: ["key", "label"], properties: { key: scalar, label: { type: "string" } } },
            },
        },
    },
};
const boxjsApp = {
    type: "object",
    properties: {
        id: { type: "string", description: "BoxJS 应用标识，不作为模块路径或存储根" },
        name: { type: "string", description: "设置页面的显示名称" },
        author: { type: "string" },
        repo: { type: "string", description: "项目主页 HTTP(S) 地址" },
        script: { type: "string", description: "脚本来源元数据，仅保留，不下载或执行" },
        icon: { type: "string", description: "显式图标 HTTP(S) 地址" },
        icons: { type: "array", items: { type: "string" }, description: "BoxJS 图标变体：透明版在前，彩色版在后；不是亮暗顺序" },
        desc: { type: "string", description: "纯文本说明" },
        description: { type: "string", description: "desc 未提供时的纯文本说明" },
        descs: { type: "array", items: { type: "string" }, description: "多段纯文本说明" },
        settings: boxjsFields,
    },
};
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
const headers = [header("X-Settings-Client", "1", "默认页面标记，不是认证凭据；调用方可通过 requestHeader 改名。", true), header("Origin", "", "浏览器请求来源；存在时必须与代理脚本配置的 origin 相同，不预设项目域名。")];
const descriptions = {
    400: "非法路径或 JSON 值",
    403: "缺标记或异源",
    404: "存储路径不存在、非接管模块或 Mock 不可用",
    405: "不支持的操作",
    413: "正文过长",
    415: "非 JSON 正文",
    500: "存储写入或执行失败",
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
        example: '<!doctype html><html><body><main id="preferences"></main><script type="module">import { mountPreferencePanes } from "/resources/preference-panes.mjs"; mountPreferencePanes({ element: document.querySelector("#preferences") });</script></body></html>',
        description: "同一份 HTML 从 /settings/{module} 路径读取模块标识，按约定 GET /configs/{module} 取得 BoxJS 并生成设置界面。不使用查询参数。缺失、多余或非法路径段不发送请求。",
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
        name: "读取模块全部数据",
        group: "持久化读写",
        schema: dataValue,
        example: { Settings: { Home: { Top_left: "videoshortcut" } } },
        description: "读取指定模块全部持久化数据，包括 Settings、Caches 和其它键，不按 BoxJS 过滤。模块不存在返回 404。",
    },
    {
        id: "pp-module-head",
        method: "head",
        path: "/api/{module}/",
        name: "探测模块读写路由",
        group: "持久化读写",
        schema: {},
        description: "确认安装配置接管此模块路由，不访问网络或存储，不表示数据已存在；主菜单仍通过 HEAD /configs/{module} 探测配置 Mock。",
    },
    {
        id: "511372916",
        method: "head",
        path: leaf,
        name: "探测指定键或子树",
        group: "持久化读写",
        schema: {},
        description: "确认路径属于安装配置的模块且路径格式合法，不读取存储或 BoxJS；不保证该路径已有值。",
    },
    {
        id: "511372917",
        method: "get",
        path: leaf,
        name: "读取指定键或子树",
        group: "持久化读写",
        schema: dataValue,
        example: "mine",
        description: "直接返回路径处的任意 JSON 值。父路径返回全部子树，缺失路径返回 404；不计算 BoxJS 默认值，也不执行 resolver。",
    },
    {
        id: "511372918",
        method: "post",
        path: leaf,
        name: "写入或替换指定值",
        group: "持久化读写",
        schema: { type: "object", required: ["saved"], properties: { saved: { type: "boolean", enum: [true] } } },
        example: { saved: true },
        description: "正文直接是 JSON 值，可为字符串、数字、布尔值、null、数组或对象；未声明的键也允许写入。替换路径处的值，不按 BoxJS 校验、不合并对象。成功返回 200 和 saved=true。",
    },
    {
        id: "511372919",
        method: "delete",
        path: leaf,
        name: "删除指定配置键",
        group: "持久化读写",
        schema: { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", enum: [true] } } },
        example: { deleted: true },
        description: "无正文，删除指定键或整个子树。路径不存在仍为 200；其它路径不受影响。前端删除设置覆盖值后使用 BoxJS 默认值，不追加 GET。",
    },
    {
        id: "pp-module-post",
        method: "post",
        path: "/api/{module}/",
        name: "替换模块全部数据",
        group: "持久化读写",
        schema: { type: "object", required: ["saved"], properties: { saved: { type: "boolean", enum: [true] } } },
        example: { saved: true },
        description: "用正文 JSON 完整替换此模块数据，不合并旧值；同一存储根中的其它模块保持不变。",
    },
    {
        id: "pp-module-delete",
        method: "delete",
        path: "/api/{module}/",
        name: "重置模块",
        group: "持久化读写",
        schema: { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", enum: [true] } } },
        example: { deleted: true },
        description: "删除整个模块节点，包含 Settings、Caches 和其它数据；保留同根的其它模块。页面重置按钮使用此接口，成功后仅重置页面缓存，不追加 GET。",
    },
    { id: "pp-caches-get", method: "get", path: "/api/{module}/Caches", name: "查看模块 Caches", group: "持久化读写", schema: dataValue, example: { items: [1, 2] }, description: "读取模块 Caches 的全部内容；缺失返回 404。页面仅在用户点击查看或刷新时请求。此路径是通用 path 接口的具体用途，不需要专用存储处理器。" },
    {
        id: "pp-caches-delete",
        method: "delete",
        path: "/api/{module}/Caches",
        name: "清空模块 Caches",
        group: "持久化读写",
        schema: { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", enum: [true] } } },
        example: { deleted: true },
        description: "删除 Caches 节点，保留模块 Settings 和同根其它模块；不存在也返回 200。成功后页面清空缓存显示，不重新读取。",
    },
];
const apis = declarations.map(entry => {
    const { method, id } = entry;
    const codes = entry.mock ? [200, 404] : [200, 400, 403, 404, 405, ...(method === "post" ? [413, 415, 500] : method === "head" ? [] : [500])];
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
        sourceUrl: "https://github.com/NSNanoCat/PreferencePanes/blob/dev/apifox/Specification.md",
        description: `## 接口用途\n\n${entry.description}\n\n## 请求契约\n\n\`${method.toUpperCase()} ${entry.path}\`\n\nmodule 是必填路径参数，必须属于插件安装配置中的模块。${entry.path.includes("{path}") ? "path 是模块内的相对路径，可包含以 / 分隔的多级目录。" : ""}路径参数不预填业务示例值；具体取值由接入项目决定。${entry.mock ? "该资源由代理 Mock 提供，不需要 X-Settings-Client 请求头。" : "请求需携带 X-Settings-Client: 1；该标记不是认证凭据。"}\n\n${method === "post" ? "正文必须为 application/json，直接传路径处的 JSON 值本身，允许对象、数组和 null。API 不校验 BoxJS 类型或枚举。" : "请求没有正文。"}\n\n${entry.example === undefined ? "" : `## 响应示例（仅用于说明）\n\n以下是一个接入项目的示例，不是固定字段、默认请求值或 Mock 规则。\n\n\`\`\`${entry.page ? "html" : "json"}\n${entry.page ? entry.example : JSON.stringify(entry.example, null, 2)}\n\`\`\`\n\n`}## 调用流程与具体示例\n\n${specification}`,
        parameters: {
            path: [
                {
                    id: "module#0",
                    name: "module",
                    type: "string",
                    schema: { type: "string", pattern: "^[a-zA-Z0-9_-]+$", minLength: 1 },
                    required: true,
                    enable: true,
                    example: "",
                    description: "模块标识：同一值用于 /settings/{module}、/configs/{module}、/api/{module}/…。对应 BoxJS ID 的 @存储根.模块.路径 中的模块段；Enhanced 仅为示例。",
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
                              example: "",
                              description: "模块内的相对 database 路径，可有多级，用 / 连接各段。逐段编码，不要把分隔斜线编码为 %2F；GET/POST/DELETE 均支持键或子树，不要求字段在 BoxJS 中声明。Settings 和 Home 均不是固定层级。",
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
                      jsonSchema: dataValue,
                      data: "",
                  }
                : { type: "none", required: false, parameters: [] },
        responses: codes.map(code => ({
            id: `pp-${id}-${code}`,
            code,
            name: code === 200 ? "成功" : descriptions[code],
            headers: [],
            contentType: method === "head" ? "noContent" : entry.page || (entry.mock && code !== 200) ? "html" : "json",
            jsonSchema: method === "head" || (entry.mock && code !== 200) ? {} : code === 200 ? entry.schema : errorSchema,
            description: method === "head" ? "无正文" : entry.mock && code !== 200 ? "Mock 不可用时由代理或原站决定响应格式，不保证 JSON。" : entry.page ? "通用 HTML；通过页面路径 /settings/{module} 按约定读取 /configs/{module}。" : "JSON 响应",
        })),
        responseExamples: [],
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
        description: "独立多模块存储桥接与页面、仅以 BoxJS JSON Mock 探测设置入口（0.6.0）",
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
                items: apis.filter(api => api.tags[0] === group).map(api => ({ name: declarations.find(entry => entry.id === api.id).name, api })),
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
const json = execFileSync(process.execPath, [fileURLToPath(import.meta.resolve("@biomejs/biome/bin/biome")), "format", "--stdin-file-path", output], { cwd: root, input: JSON.stringify(document), encoding: "utf8" });
if (process.argv.includes("--check")) {
    if ((await readFile(output, "utf8")) !== json) throw new Error("Apifox JSON is stale");
} else await writeFile(output, json);
console.log(
    JSON.stringify({
        operations: apis.length,
        paths: new Set(apis.map(api => api.path)).size,
        writes: apis.filter(api => api.method === "post").length,
        withBody: apis.filter(api => api.requestBody.type === "application/json").length,
        schemas: document.schemaCollection.length,
        emptyObjectBodies: apis.filter(api => api.method === "post" && Object.keys(api.requestBody.jsonSchema).length === 0).length,
        responseDefinitions: apis.reduce((n, api) => n + api.responses.length, 0),
    }),
);
