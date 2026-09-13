import { readFile } from "node:fs/promises";
import http from "node:http";
import vm from "node:vm";
import { normalizeBoxJs } from "../src/browser/boxjs.mjs";

// 测试台不生成项目入口。上传的两个文件只供模块预览，存储为独立内存。
// The testbench is not a project landing page; uploads feed only module previews with isolated storage.
const importer = await readFile(new URL("./index.html", import.meta.url), "utf8");
const script = await readFile(new URL("./importer.mjs", import.meta.url), "utf8");
const page = await readFile(new URL("../dist/module/index.html", import.meta.url), "utf8");
const index = await readFile(new URL("../dist/module/index.mjs", import.meta.url), "utf8");
const navigation = await readFile(new URL("../dist/module/navigation.mjs", import.meta.url), "utf8");
let configuration;
let moduleName;
const store = new Map();
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
        if (url.pathname === "/preview" && request.method === "POST") {
            configuration = undefined;
            moduleName = undefined;
            store.clear();
            try {
                const input = JSON.parse(body);
                configuration = input.boxjs;
                moduleName = normalizeBoxJs(configuration).module;
                reply.writeHead(200, { "Content-Type": "application/json" });
                reply.end(JSON.stringify({ url: `/settings/${moduleName}`, module: moduleName }));
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
