import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { build } from "../src/index.mjs";
import { config } from "./fixtures/module.mjs";

const document = { name: "First", settings: config };
const other = { name: "Other", settings: [{ id: "@Another.Other.flag", name: "Flag", type: "boolean", val: true }] };
const files = await build(document, ".pp-panel { color: red; }");
const otherFiles = await build(other);

test("public browser is module-only and contains no project menu or installer", async () => {
    assert.deepEqual(Object.keys(await import("../src/index.mjs")), ["build"]);
    assert.deepEqual(Object.keys(await import("../dist/preference-panes.mjs")), ["mount"]);
    assert.deepEqual(Object.keys(await import("@nsnanocat/preference-panes/navigation")), ["ModuleFrame", "Navigation"]);
    const browser = await readFile(new URL("../dist/preference-panes.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(browser, /node:fs|node-fetch|\$persistentStore|@nsnanocat\/util/);
    assert.doesNotMatch(browser, /pp-home|self-panel|pp-install|安装模块|data-module/);
    for (const file of ["preference-panes.request.js", "settings/home.css"]) await assert.rejects(access(new URL(`../dist/${file}`, import.meta.url)), { code: "ENOENT" });
});

test("each build creates only one module and never overwrites a project landing page", async () => {
    assert.equal(files["settings/index.html"], undefined);
    assert.equal(files["settings/assets/index.html"], undefined);
    assert.equal(files["settings/assets/boxjs.json"], undefined);
    assert.deepEqual(JSON.parse(files["settings/assets/Module.boxjs.json"]), document);
    assert.equal(files["settings/assets/Module.css"], ".pp-panel { color: red; }");
    assert.equal(otherFiles["settings/assets/Other.css"], "");
    assert.equal(files["settings/Other/index.html"], undefined);
    assert.equal(files["settings/assets/app.mjs"], otherFiles["settings/assets/app.mjs"]);
    assert.equal(files["settings/assets/navigation.mjs"], otherFiles["settings/assets/navigation.mjs"]);
    await assert.rejects(build({ apps: [document, other] }), /exactly one module/);
    await assert.rejects(build([]), /exactly one module/);
    await assert.rejects(build(document, { stylesheets: [] }));
});

for (const quantumult of [false, true])
    test(`${quantumult ? "Quantumult X" : "Surge"}: module script leaves the landing page, other modules and configuration requests alone`, async () => {
        const store = new Map();
        let reads = 0;
        const run = (path, method = "GET", body, script = files["settings/assets/Module.request.js"]) =>
            new Promise(resolve => {
                const read = key => {
                    reads++;
                    return store.get(key);
                };
                const write = (value, key) => {
                    store.set(key, value);
                    return true;
                };
                vm.runInNewContext(script, {
                    ...(quantumult ? { $task: {}, $prefs: { valueForKey: read, setValueForKey: write } } : { $environment: { "surge-version": "test" }, $persistentStore: { read, write } }),
                    $request: { url: `https://example.org${path}`, method, body: JSON.stringify(body), headers: { "X-Settings-Client": "1", "Content-Type": "application/json" } },
                    $script: { startTime: Date.now() / 1000 },
                    $done: result => resolve(quantumult ? result : result.response),
                    console: { log() {}, error() {} },
                });
            });
        const status = value => (quantumult ? Number(value.status.split(" ")[1]) : value.status);
        for (const path of ["/settings/", "/settings/Other", "/configs/Module"]) {
            const result = await run(path);
            if (quantumult) assert.deepEqual(JSON.parse(JSON.stringify(result)), {});
            else assert.equal(result, undefined);
        }
        assert.equal(reads, 0);
        assert.match((await run("/settings/Module")).body, /<!doctype html>/i);
        assert.equal((await run("/settings/assets/Module.css")).body, ".pp-panel { color: red; }");
        assert.equal(status(await run("/api/Module/Settings/unlisted", "POST", { raw: true })), 200);
        assert.equal(status(await run("/api/Other/flag", "POST", false)), 404);
        assert.equal(status(await run("/api/Other/flag", "POST", false, otherFiles["settings/assets/Other.request.js"])), 200);
        assert.equal(status(await run("/api/Module/", "DELETE")), 200);
        assert.equal(JSON.parse(store.get("Another")).Other.flag, false);
        assert.deepEqual(JSON.parse((await run("/configs/Module", "GET", undefined, files["settings/assets/Module.config.js"])).body), document);
    });
