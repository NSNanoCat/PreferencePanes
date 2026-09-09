import { readFile } from "node:fs/promises";
import http from "node:http";
import vm from "node:vm";
import { build } from "../src/index.mjs";

// 预览只导入 BoxJS 和可选 CSS；代理存储使用独立内存，绝不读取用户设置。
// Preview imports only BoxJS and optional CSS; isolated memory never reads the user's proxy settings.
const boxjs = JSON.parse(await readFile(process.argv[2] ?? new URL("./Module.boxjs.json", import.meta.url), "utf8"));
const css = process.argv[3] ? await readFile(process.argv[3], "utf8") : undefined;
const files = await build(boxjs, css);
const store = new Map();
const server = http.createServer(async (request, reply) => {
    try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        if (url.pathname === "/") {
            reply.writeHead(302, { Location: "/settings/" });
            reply.end();
            return;
        }
        const module = /^\/configs\/([a-zA-Z0-9_-]+)$/.exec(url.pathname)?.[1];
        const script = module ? files[`settings/assets/${module}.config.js`] : files["settings/assets/PreferencePanes.request.js"];
        if (!script) {
            reply.writeHead(404);
            reply.end();
            return;
        }
        let body = "";
        for await (const chunk of request) body += chunk;
        const response = await new Promise(resolve =>
            vm.runInNewContext(script, {
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
server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => console.log(`PreferencePanes: http://127.0.0.1:${server.address().port}/settings/`));
