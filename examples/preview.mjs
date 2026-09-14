import { readFile } from "node:fs/promises";
import http from "node:http";
import vm from "node:vm";
import { normalizeBoxJs } from "../src/browser/boxjs.mjs";

// 测试台使用真实通用页面渲染内置或导入的 BoxJS，存储保持在独立内存中。
// The testbench renders built-in or imported BoxJS through the real generic page with isolated storage.
const importer = await readFile(new URL("./index.html", import.meta.url), "utf8");
const script = await readFile(new URL("./importer.mjs", import.meta.url), "utf8");
const example = JSON.parse(await readFile(new URL("./Module.boxjs.json", import.meta.url), "utf8"));
const page = await readFile(new URL("../dist/module/index.html", import.meta.url), "utf8");
const index = await readFile(new URL("../dist/module/index.mjs", import.meta.url), "utf8");
const navigation = await readFile(new URL("../dist/module/navigation.mjs", import.meta.url), "utf8");
let configuration;
let moduleName;
const store = new Map();

/**
 * 替换当前预览，并按需注入一份存储根。
 * Replace the current preview and optionally seed one storage root.
 * @param {unknown} boxjs BoxJS 配置 / BoxJS configuration.
 * @param {unknown} [storedRoot] 存储根 / Stored root.
 * @returns {{url: string, module: string}} 预览入口 / Preview entry.
 */
function configurePreview(boxjs, storedRoot) {
    const definition = normalizeBoxJs(boxjs);
    configuration = boxjs;
    moduleName = definition.module;
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
                const result =
                    url.pathname === "/example"
                        ? configurePreview(example, {
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
                        : configurePreview(JSON.parse(body).boxjs);
                reply.writeHead(200, { "Content-Type": "application/json" });
                reply.end(JSON.stringify(result));
            } catch (error) {
                reply.writeHead(400, { "Content-Type": "application/json" });
                reply.end(JSON.stringify({ error: error.message }));
            }
            return;
        }
        const asset = {
            [`/settings/${moduleName}`]: ["text/html", page],
            [`/settings/${moduleName}/`]: ["text/html", page],
            "/settings/assets/index.mjs": ["text/javascript", index],
            "/settings/assets/navigation.mjs": ["text/javascript", navigation],
        }[url.pathname];
        if (asset && ["GET", "HEAD"].includes(request.method)) {
            reply.writeHead(200, { "Content-Type": `${asset[0]}; charset=utf-8`, "Cache-Control": "no-store" });
            reply.end(request.method === "HEAD" ? "" : asset[1]);
            return;
        }
        if (configuration && url.pathname === `/api/${moduleName}` && ["HEAD", "GET"].includes(request.method)) {
            reply.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-PreferencePanes-Version": "preview" });
            reply.end(request.method === "HEAD" ? "" : JSON.stringify(configuration));
            return;
        }
        if (!url.pathname.startsWith("/api/")) {
            reply.writeHead(404);
            reply.end();
            return;
        }
        const runtime = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");
        const response = await new Promise(resolve =>
            vm.runInNewContext(runtime, {
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
