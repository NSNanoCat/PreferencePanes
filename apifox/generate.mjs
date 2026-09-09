import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * 从当前 form 接口契约生成 Apifox 原生文档，示例不作为默认请求参数。
 * Generate native Apifox documentation for the form contract, without default example requests.
 * @module apifox/generate
 */
const moduleId = 8522462;
const specification = await readFile(new URL("Specification.md", import.meta.url), "utf8");
const parameter = (name, description, required = false) => ({ id: `${name}#0`, name, description, type: "string", schema: { type: "string" }, required, enable: false, example: "" });
const declarations = [
    { id: "pp-page-get", method: "get", path: "/settings/{module}", name: "打开模块设置页面", group: "模块设置页面", page: true },
    { id: "pp-config-head", method: "head", path: "/configs/{module}", name: "探测业务模块配置 Mock", group: "模块配置" },
    { id: "pp-config-get", method: "get", path: "/configs/{module}", name: "取得版本对应的 BoxJS", group: "模块配置" },
    { id: "pp-store-get", method: "post", path: "/api/get", name: "读取完整存储键", group: "本地 form 存储 API" },
    { id: "pp-store-set", method: "post", path: "/api/set", name: "写入完整存储键", group: "本地 form 存储 API" },
    { id: "pp-store-delete", method: "post", path: "/api/delete", name: "删除完整存储键或子树", group: "本地 form 存储 API" },
];
const apis = declarations.map(entry => {
    const form = entry.method === "post";
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
        description: `## ${entry.name}\n\n${form ? "POST form 的字段名是完整 @root.path，读取和删除的字段值留空。使用 {{storageKey}} 变量填写字段名；不要把示例设为固定业务路径。API 不鉴权、不下载 BoxJS、不校验字段枚举。" : "module 是由 BoxJS 字段 ID 推导的路径参数，不预填业务模块名。配置由业务仓库版本对应的 Mock 提供；页面由 PreferencePanes 提供。"}\n\n${specification}`,
        sourceUrl: "https://github.com/NSNanoCat/PreferencePanes/blob/dev/apifox/Specification.md",
        parameters: {
            path: form ? [] : [parameter("module", "BoxJS 的模块段，动态填入", true)],
            query: entry.page ? [parameter("json", "JSON 资源地址，默认 /configs/{module}"), parameter("css", "可选 CSS 地址，省略使用内置默认样式")] : [],
            header: entry.page ? [parameter("X-PreferencePanes-JSON", "JSON 地址，优先于 json 查询参数"), parameter("X-PreferencePanes-CSS", "CSS 地址，优先于 css 查询参数")] : [],
            cookie: [],
        },
        requestBody: form
            ? {
                  type: "application/x-www-form-urlencoded",
                  required: true,
                  parameters: [parameter("{{storageKey}}", "字段名填写完整 @root.path；set 的值为普通文本或 JSON，get/delete 留空", true)],
              }
            : { type: "none", required: false, parameters: [] },
        responses: (form ? [200, 400, 404, 405, 415, 500] : [200, 404]).map(code => ({
            id: `${entry.id}-${code}`,
            code,
            name: code === 200 ? "成功" : "失败",
            headers: [],
            contentType: entry.method === "head" ? "noContent" : entry.page ? "html" : "json",
            jsonSchema: code === 200 ? {} : { type: "object", properties: { error: { type: "string" } } },
            description: code === 200 ? "get 返回原始 JSON 值；set/delete 返回成功标记" : "格式、路径、方法或存储错误；没有 401/403 鉴权响应",
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
    info: { name: "Preference Panes", description: "模块渲染与无鉴权 form 存储桥接", mockRule: { rules: [], enableSystemRule: true } },
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
const output = new URL("preference-panes.apifox.json", import.meta.url);
const json = execFileSync(process.execPath, [fileURLToPath(import.meta.resolve("@biomejs/biome/bin/biome")), "format", "--stdin-file-path", fileURLToPath(output)], { input: JSON.stringify(document), encoding: "utf8" });
if (process.argv.includes("--check")) {
    if ((await readFile(output, "utf8")) !== json) throw new Error("Apifox JSON is stale");
} else await writeFile(output, json);
console.log(JSON.stringify({ operations: apis.length, paths: new Set(apis.map(api => api.path)).size, formOperations: apis.filter(api => api.requestBody.type === "application/x-www-form-urlencoded").length }));
