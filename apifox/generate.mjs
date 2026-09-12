import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * 从当前模块 API 契约生成 Apifox 原生文档，示例不作为默认请求参数。
 * Generate native Apifox documentation for the module API contract, without default example requests.
 * @module apifox/generate
 */
const moduleId = 8522462;
const specification = await readFile(new URL("Specification.md", import.meta.url), "utf8");
const integration = await readFile(new URL("HostIntegration.md", import.meta.url), "utf8");
const parameter = (name, description, required = false) => ({ id: `${name}#0`, name, description, type: "string", schema: { type: "string" }, required, enable: false, example: "" });
const actionSchemas = {
    get: {
        type: "object",
        properties: {
            key: { type: "string", description: "不含存储根的 BoxJS 字段路径；与 scope 二选一" },
            scope: { type: "string", enum: ["settings", "caches", "module"], description: "读取模块子树；与 key 二选一" },
        },
        oneOf: [{ required: ["key"] }, { required: ["scope"] }],
        additionalProperties: false,
    },
    set: {
        type: "object",
        properties: {
            key: { type: "string", description: "不含存储根、从当前 BoxJS 匹配的字段路径" },
            value: { description: "浏览器已按控件定义校验的 JSON 值" },
        },
        required: ["key", "value"],
        additionalProperties: false,
    },
    delete: {
        type: "object",
        properties: {
            key: { type: "string", description: "不含存储根的 BoxJS 字段路径；与 scope 二选一" },
            scope: { type: "string", enum: ["settings", "caches", "module"], description: "删除模块子树；与 key 二选一" },
        },
        oneOf: [{ required: ["key"] }, { required: ["scope"] }],
        additionalProperties: false,
    },
};
const modelSchema = {
    type: "object",
    properties: {
        module: { type: "string" },
        boxjs: { description: "API 从上游取得的原始 BoxJS JSON" },
        values: { type: "object", description: "只包含实际已保存的字段值", additionalProperties: {} },
        configURL: { type: "string", description: "后续动作继续使用的 BoxJS 来源" },
    },
    required: ["module", "boxjs", "values", "configURL"],
};
const declarations = [
    { id: "pp-page-get", method: "get", path: "/settings/{module}", name: "打开模块设置页面", group: "模块设置页面", page: true },
    { id: "pp-app-get", method: "get", path: "/settings/assets/app.mjs", name: "加载模块设置渲染器", group: "通用页面资源", asset: true },
    { id: "pp-navigation-get", method: "get", path: "/settings/assets/navigation.mjs", name: "加载通用页面导航组件", group: "通用页面资源", asset: true },
    { id: "pp-module-head", method: "head", path: "/api/{module}", name: "探测模块可用性与版本", group: "模块 API", api: true, probe: true },
    { id: "pp-module-get", method: "get", path: "/api/{module}", name: "取得 BoxJS 与当前值", group: "模块 API", api: true, model: true },
    { id: "pp-module-action-get", method: "post", path: "/api/{module}/get", name: "读取模块字段或子树", group: "模块 API", api: true, action: "get" },
    { id: "pp-module-action-set", method: "post", path: "/api/{module}/set", name: "写入模块字段", group: "模块 API", api: true, action: "set" },
    { id: "pp-module-action-delete", method: "post", path: "/api/{module}/delete", name: "删除模块字段或子树", group: "模块 API", api: true, action: "delete" },
    { id: "pp-config-head", method: "head", path: "/configs/{module}", name: "提供业务模块配置探测", group: "BoxJS 上游", upstream: true },
    { id: "pp-config-get", method: "get", path: "/configs/{module}", name: "提供版本对应的 BoxJS", group: "BoxJS 上游", upstream: true },
];
const apis = declarations.map(entry => {
    const codes = entry.action ? [200, 400, 404, 405, 415, 422, 500, 502] : entry.model ? [200, 404, 405, 422, 502] : entry.probe ? [200, 404, 405, 502] : [200, 404];
    const description = entry.action
        ? "网页提交字段路径或模块 scope；API 重新取得 BoxJS，映射实际 @root.path 并执行存储。控件值语义由 Web 校验。"
        : entry.model
          ? "API 取得原始 BoxJS 并读取已存字段值；不生成控件定义、不补默认值。"
          : entry.probe
            ? "网页只探测该 API；代理脚本向 BoxJS 上游发送 HEAD，并透传状态与版本头。"
            : entry.upstream
              ? "该资源由业务模块提供，只供代理 API 获取；网页不直接调用。"
              : entry.asset
                ? "该资源由同一个 PreferencePanes api.js 返回。项目网站只在 HTML 中引用路径，不托管或复制运行脚本。"
                : "通用模块页面只调用模块 API，并在 Web 侧完成规范化、校验和渲染。";
    return {
        id: entry.id,
        name: entry.name,
        method: entry.method,
        path: entry.path,
        type: "http",
        moduleId,
        serverId: "default",
        visibility: "SHARED",
        status: "testing",
        tags: [entry.group],
        operationId: `preference_panes_${entry.id}`,
        description: `## ${entry.name}\n\n${description}\n\n${specification}`,
        sourceUrl: "https://github.com/NSNanoCat/PreferencePanes/blob/dev/apifox/Specification.md",
        parameters: {
            path: entry.path.includes("{module}") ? [parameter("module", "BoxJS 的模块段，动态填入", true)] : [],
            query: entry.page ? [parameter("json", "JSON 资源地址，默认 /configs/{module}"), parameter("css", "可选 CSS 地址，省略使用内置默认样式")] : [],
            header: entry.page ? [parameter("X-PreferencePanes-JSON", "BoxJS 来源，优先于 json 查询参数"), parameter("X-PreferencePanes-CSS", "CSS 地址，优先于 css 查询参数")] : entry.api ? [parameter("X-PreferencePanes-JSON", "API 要获取的 BoxJS 来源；默认 /configs/{module}")] : [],
            cookie: [],
        },
        requestBody: entry.action
            ? {
                  type: "application/json",
                  required: true,
                  parameters: [],
                  jsonSchema: actionSchemas[entry.action],
              }
            : { type: "none", required: false, parameters: [] },
        responses: codes.map(code => ({
            id: `${entry.id}-${code}`,
            code,
            name: code === 200 ? "成功" : "失败",
            headers: entry.upstream || entry.probe || entry.model ? [parameter("X-PreferencePanes-Version", "与配置和业务脚本同次构建的版本", true)] : [],
            contentType: entry.method === "head" ? "noContent" : entry.page ? "html" : entry.asset ? "text" : "json",
            jsonSchema: code === 200 && entry.model ? modelSchema : code === 200 ? {} : { type: "object", properties: { error: { type: "string" } } },
            description: code === 200 ? "操作成功；具体正文见接口职责。" : "方法、正文、BoxJS 上游、字段路径或存储错误；没有 401/403 鉴权响应。",
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
    info: { name: "Preference Panes", description: "BoxJS 模块 API 与浏览器渲染组件", mockRule: { rules: [], enableSystemRule: true } },
    projectSetting: { id: "8852249", auth: {}, securityScheme: {}, gateway: [], language: "zh-CN", apiStatuses: ["developing", "testing", "released", "deprecated"], mockSettings: {}, preProcessors: [], postProcessors: [], advancedSettings: {}, servers: [{ id: "default", name: "默认服务", moduleId }], cloudMock: {} },
    apiCollection: [
        {
            id: "pp-root",
            name: "根目录",
            moduleId,
            parentId: 0,
            serverId: "default",
            items: [...new Set(declarations.map(entry => entry.group))].map((group, index) => ({
                id: `pp-folder-${index}`,
                name: group,
                moduleId,
                parentId: 0,
                serverId: "default",
                visibility: "SHARED",
                description: group,
                auth: {},
                securityScheme: {},
                preProcessors: [],
                postProcessors: [],
                inheritPreProcessors: {},
                inheritPostProcessors: {},
                items: apis.filter(api => api.tags[0] === group).map(api => ({ name: api.name, api })),
            })),
        },
    ],
    moduleSettings: [{ id: String(moduleId), name: "默认模块", description: "", moduleVariables: [], openApiInfo: {} }],
};
for (const key of [
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
    document[key] = [];
document.docCollection = [
    {
        name: document.apiCollection[0].name,
        moduleId,
        children: [],
        items: [
            {
                id: "pp-host-integration",
                name: integration.split("\n")[0].slice(2),
                sidebarTitle: "",
                content: integration,
                folderId: 0,
                type: "",
                tags: [],
                visibility: "SHARED",
                moduleId,
            },
        ],
    },
];
const output = new URL("preference-panes.apifox.json", import.meta.url);
const json = execFileSync(process.execPath, [fileURLToPath(import.meta.resolve("@biomejs/biome/bin/biome")), "format", "--stdin-file-path", fileURLToPath(output)], { input: JSON.stringify(document), encoding: "utf8" });
if (process.argv.includes("--check")) {
    if ((await readFile(output, "utf8")) !== json) throw new Error("Apifox JSON is stale");
} else await writeFile(output, json);
console.log(JSON.stringify({ documents: document.docCollection[0].items.length, operations: apis.length, paths: new Set(apis.map(api => api.path)).size, jsonOperations: apis.filter(api => api.requestBody.type === "application/json").length }));
