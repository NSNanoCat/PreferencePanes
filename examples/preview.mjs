import { readFile } from "node:fs/promises";
import http from "node:http";
import vm from "node:vm";
import { normalizeBoxJs } from "../src/browser/boxjs.mjs";

// 测试台使用真实通用页面渲染内置或导入的 BoxJS，存储保持在独立内存中。
// The testbench renders built-in or imported BoxJS through the real generic page with isolated storage.
const importer = await readFile(new URL("./index.html", import.meta.url), "utf8");
const script = await readFile(new URL("./importer.mjs", import.meta.url), "utf8");
const example = JSON.parse(await readFile(new URL("./Module.boxjs.json", import.meta.url), "utf8"));
const exampleCSS = await readFile(new URL("./theme.css", import.meta.url), "utf8");
const web = await readFile(new URL("../dist/web.js", import.meta.url), "utf8");
const api = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");
let configuration;
let moduleName;
let stylesheet;
const store = new Map();

/**
 * 替换当前预览，并按需注入一份存储根。
 * Replace the current preview and optionally seed one storage root.
 * @param {unknown} boxjs BoxJS 配置 / BoxJS configuration.
 * @param {string} cssMode CSS 模式 / CSS mode.
 * @param {unknown} css 导入的 CSS / Imported CSS.
 * @param {unknown} [storedRoot] 存储根 / Stored root.
 * @returns {{url: string, module: string}} 预览入口 / Preview entry.
 */
function configurePreview(boxjs, cssMode, css, storedRoot) {
    const definition = normalizeBoxJs(boxjs);
    if (!["builtin", "example", "import"].includes(cssMode)) throw new TypeError("Unknown CSS mode");
    if (cssMode === "import" && typeof css !== "string") throw new TypeError("Imported CSS must be text");
    configuration = boxjs;
    moduleName = definition.module;
    stylesheet = cssMode === "example" ? exampleCSS : cssMode === "import" ? css : undefined;
    if (storedRoot !== undefined) store.set(definition.storageKey, JSON.stringify(storedRoot));
    return { url: `/settings/${moduleName}`, module: moduleName };
}

const server = http.createServer(async (request, reply) => {
    try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        if (["/", "/settings/", "/settings"].includes(url.pathname)) {
            reply.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
            reply.end(importer);
            return;
        }
        if (url.pathname === "/importer.mjs") {
            reply.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
            reply.end(script);
            return;
        }
        let body = "";
        for await (const chunk of request) body += chunk;
        if (["/example", "/preview"].includes(url.pathname) && request.method === "POST") {
            configuration = undefined;
            moduleName = undefined;
            store.clear();
            try {
                const input = JSON.parse(body);
                const result =
                    url.pathname === "/example"
                        ? configurePreview(example, input.cssMode, input.css, {
                              Module: {
                                  Settings: {
                                      enabled: false,
                                      mode: "legacy",
                                      items: ["first", "removed"],
                                      displayName: "内置示例",
                                      notes: "这些值来自预览服务器的内存存储。",
                                      retries: "not-a-number",
                                      categories: ["legacy-url-value"],
                                  },
                              },
                          })
                        : configurePreview(input.boxjs, input.cssMode, input.css);
                reply.writeHead(200, { "Content-Type": "application/json" });
                reply.end(JSON.stringify(result));
            } catch (error) {
                reply.writeHead(400, { "Content-Type": "application/json" });
                reply.end(JSON.stringify({ error: error.message }));
            }
            return;
        }
        if (configuration && url.pathname === "/preview/boxjs.json" && ["HEAD", "GET"].includes(request.method)) {
            reply.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-PreferencePanes-Version": "preview" });
            reply.end(request.method === "HEAD" ? "" : JSON.stringify(configuration));
            return;
        }
        if (stylesheet !== undefined && url.pathname === "/preview/style.css" && ["HEAD", "GET"].includes(request.method)) {
            reply.writeHead(200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" });
            reply.end(request.method === "HEAD" ? "" : stylesheet);
            return;
        }
        if (url.pathname.startsWith("/settings/")) {
            const headers = { ...request.headers, "X-PreferencePanes-JSON": "/preview/boxjs.json" };
            if (stylesheet !== undefined) headers["X-PreferencePanes-CSS"] = "/preview/style.css";
            const response = await new Promise(resolve =>
                vm.runInNewContext(web, {
                    $environment: { "surge-version": "preview" },
                    $script: { startTime: Date.now() / 1000 },
                    $request: { url: url.href, method: request.method, headers },
                    $done: result => resolve(result.response),
                    console,
                }),
            );
            reply.writeHead(response?.status ?? 404, response?.headers);
            reply.end(response?.body);
            return;
        }
        if (!url.pathname.startsWith("/api/")) {
            reply.writeHead(404);
            reply.end();
            return;
        }
        const response = await new Promise(resolve =>
            vm.runInNewContext(api, {
                $environment: { "surge-version": "preview" },
                $script: { startTime: Date.now() / 1000 },
                $persistentStore: {
                    read: key => store.get(key),
                    write: (value, key) => {
                        store.set(key, value);
                        return true;
                    },
                },
                $request: { url: url.href, method: request.method, headers: request.headers, body },
                $done: result => resolve(result.response),
                console,
            }),
        );
        reply.writeHead(response?.status ?? 404, response?.headers);
        reply.end(response?.body);
    } catch (error) {
        console.error(error);
        reply.writeHead(500);
        reply.end("Preview failed");
    }
});
server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => console.log(`PreferencePanes import test: http://127.0.0.1:${server.address().port}/`));
