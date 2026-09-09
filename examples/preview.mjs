import { readFile } from "node:fs/promises";
import http from "node:http";
import vm from "node:vm";
import { build } from "../src/index.mjs";
import { loadOfficialOverrides } from "./official-overrides.mjs";

// 测试台不生成项目入口。上传的两个文件只供模块预览，存储为独立内存。
// The testbench is not a project landing page; uploads feed only module previews with isolated storage.
const importer = await readFile(new URL("./index.html", import.meta.url), "utf8");
const script = await readFile(new URL("./importer.mjs", import.meta.url), "utf8");
const overrides = process.argv.includes("--override-official") ? await loadOfficialOverrides() : null;
let files = {};
let configuration;
let moduleName;
const store = new Map();
const server = http.createServer(async (request, reply) => {
    try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const fixture = overrides?.asset(url.pathname);
        if (fixture && ["GET", "HEAD"].includes(request.method)) {
            reply.writeHead(200, { "Content-Type": "text/css", "Cache-Control": "no-store" });
            reply.end(request.method === "HEAD" ? "" : fixture);
            return;
        }
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
            files = {};
            configuration = undefined;
            moduleName = undefined;
            store.clear();
            try {
                const input = JSON.parse(body);
                files = await build(input.boxjs, input.css);
                const page = Object.keys(files).find(path => path.endsWith("/index.html"));
                configuration = input.boxjs;
                moduleName = page.split("/")[1];
                reply.writeHead(200, { "Content-Type": "application/json" });
                reply.end(JSON.stringify({ url: `/${page.slice(0, -"index.html".length)}?css=/settings/assets/${moduleName}.css`, module: moduleName }));
            } catch (error) {
                reply.writeHead(400, { "Content-Type": "application/json" });
                reply.end(JSON.stringify({ error: error.message }));
            }
            return;
        }
        const path = url.pathname.slice(1);
        const entry = files[path] ?? files[`${path.replace(/\/$/, "")}/index.html`];
        if (entry !== undefined && ["GET", "HEAD"].includes(request.method)) {
            const type = path.endsWith(".css") ? "text/css" : path.endsWith(".mjs") || path.endsWith(".js") ? "text/javascript" : path.endsWith(".json") ? "application/json" : "text/html";
            reply.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
            reply.end(request.method === "HEAD" ? "" : overrides ? overrides.rewrite(entry) : entry);
            return;
        }
        if (configuration && url.pathname === `/configs/${moduleName}` && ["HEAD", "GET"].includes(request.method)) {
            reply.writeHead(200, { "Content-Type": "application/json" });
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
                setTimeout,
                clearTimeout,
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
