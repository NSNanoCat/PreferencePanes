import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * 从当前模块 Mock 与 form 存储契约生成 Apifox 原生文档。
 * Generate native Apifox documentation for the module mock and form storage contract.
 * @module apifox/generate
 */
const moduleId = 8522462;
const specification = await readFile(new URL("Specification.md", import.meta.url), "utf8");
const integration = await readFile(new URL("HostIntegration.md", import.meta.url), "utf8");
const parameter = (name, description, required = false) => ({ id: `${name}#0`, name, description, type: "string", schema: { type: "string" }, required, enable: false, example: "" });
const declarations = [
    { id: "pp-page-get", method: "get", path: "/settings/{module}", name: "打开模块设置页面", group: "模块设置页面", page: true },
    { id: "pp-index-get", method: "get", path: "/settings/assets/index.mjs", name: "加载模块设置入口", group: "通用页面资源", asset: true },
    { id: "pp-navigation-get", method: "get", path: "/settings/assets/navigation.mjs", name: "加载通用页面导航组件", group: "通用页面资源", asset: true },
    { id: "pp-module-head", method: "head", path: "/api/{module}", name: "探测模块可用性与版本", group: "模块 API", moduleMock: true, probe: true },
    { id: "pp-module-get", method: "get", path: "/api/{module}", name: "读取模块 BoxJS", group: "模块 API", moduleMock: true, configuration: true },
    { id: "pp-store-get", method: "post", path: "/api/get", name: "读取完整存储路径", group: "通用存储 API", api: true, store: true },
    { id: "pp-store-set", method: "post", path: "/api/set", name: "写入完整存储路径", group: "通用存储 API", api: true, store: true },
    { id: "pp-store-delete", method: "post", path: "/api/delete", name: "删除完整存储路径", group: "通用存储 API", api: true, store: true },
];
const apis = declarations.map(entry => {
    const codes = entry.store ? [200, 400, 404, 405, 415, 500] : [200, 404];
    const description = entry.store
        ? "网页提交恰好一个 form 字段；字段名是完整 @root.path。API 不下载或解析 BoxJS，字段和值由 Web 校验。"
        : entry.probe
          ? "网页只探测该 API；业务模块模板直接返回空正文与版本头。"
          : entry.configuration
            ? "网页通过该 API 读取原始 BoxJS；业务模块模板直接 Mock 同版 JSON 与版本头。"
            : entry.asset
              ? "该资源由 PreferencePanes Release 独立发布，消费方按路径直接映射。"
              : "通用模块页面直接映射 Release 的静态 index.html，可通过查询参数或 ModuleFrame 输入声明 BoxJS 与项目 stylesheet 资源；Web 侧完成规范化、校验和渲染。";
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
            query: entry.page ? [parameter("json", "可选 BoxJS JSON 地址；未指定时使用 /api/{module}，相对地址按模块页面 URL 解析，仅支持 HTTP(S)"), parameter("css", "可选 stylesheet 地址；相对地址按模块页面 URL 解析，仅支持 HTTP(S)")] : [],
            header: [],
            cookie: [],
        },
        requestBody: entry.store
            ? {
                  type: "application/x-www-form-urlencoded",
                  required: true,
                  parameters: [parameter("{{storageKey}}", "字段名填写完整 @root.path；set 的值为 JSON，get/delete 留空", true)],
              }
            : { type: "none", required: false, parameters: [] },
        responses: codes.map(code => ({
            id: `${entry.id}-${code}`,
            code,
            name: code === 200 ? "成功" : "失败",
            headers: entry.moduleMock ? [parameter("X-PreferencePanes-Version", "与 BoxJS 和业务脚本同次构建的版本", true)] : [],
            contentType: entry.method === "head" ? "noContent" : entry.page ? "html" : entry.asset ? "text" : "json",
            jsonSchema: code === 200 ? {} : { type: "object", properties: { error: { type: "string" } } },
            description: code === 200 ? "操作成功；具体正文见接口职责。" : "模块未安装、form 正文、路径或存储错误；没有 401/403 鉴权响应。",
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
    info: { name: "Preference Panes", description: "模块 BoxJS Mock、通用设置前端与固定存储 API", mockRule: { rules: [], enableSystemRule: true } },
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
console.log(JSON.stringify({ documents: document.docCollection[0].items.length, operations: apis.length, paths: new Set(apis.map(api => api.path)).size, formOperations: apis.filter(api => api.requestBody.type === "application/x-www-form-urlencoded").length }));
