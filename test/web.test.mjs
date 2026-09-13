import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../dist/web.js", import.meta.url), "utf8");

for (const quantumult of [false, true])
    test(`${quantumult ? "Quantumult X" : "Surge"}: web script serves pages and assets without intercepting APIs`, async () => {
        const run = (path, method = "GET", headers = {}) =>
            new Promise(resolve => {
                vm.runInNewContext(source, {
                    ...(quantumult ? { $task: {} } : { $environment: { "surge-version": "test" } }),
                    $request: { url: `https://example.org${path}`, method, headers },
                    $script: { startTime: Date.now() / 1000 },
                    $done: result => resolve(quantumult ? result : result.response),
                    console: { log() {}, error() {} },
                });
            });
        const status = value => (quantumult ? Number(value.status.split(" ")[1]) : value.status);
        const page = await run("/settings/Module?json=/query.json", "GET", { "X-PreferencePanes-JSON": "/header.json", "X-PreferencePanes-CSS": "/theme.css" });
        assert.equal(status(page), 200);
        assert.match(page.body, /<!doctype html>/i);
        const data = page.body.match(/name="preference-panes-inputs" content="([^"]+)"/)[1];
        assert.deepEqual(JSON.parse(decodeURIComponent(data)), {
            url: "https://example.org/settings/Module?json=/query.json",
            module: "Module",
            json: "/header.json",
            css: "/theme.css",
        });
        for (const asset of ["index.mjs", "navigation.mjs"]) {
            const result = await run(`/settings/assets/${asset}`);
            assert.equal(status(result), 200);
            assert.match(result.body, /PreferencePanes|preference-panes/);
        }
        assert.equal(status(await run("/settings/Module", "POST")), 405);
        for (const path of ["/api/Module", "/configs/Module", "/settings/assets/host.mjs"]) {
            const result = await run(path);
            if (quantumult) assert.deepEqual(JSON.parse(JSON.stringify(result)), {});
            else assert.equal(result, undefined);
        }
    });
