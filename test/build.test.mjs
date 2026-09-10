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
    assert.deepEqual(Object.keys(await import("@nsnanocat/preference-panes/navigation")), ["ActionMenu", "ModuleFrame", "ModuleStatus", "Navigation"]);
    const browser = await readFile(new URL("../dist/preference-panes.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(browser, /node:fs|node-fetch|\$persistentStore|@nsnanocat\/util/);
    assert.doesNotMatch(browser, /pp-home|self-panel|pp-install|安装模块|data-module/);
    for (const file of ["preference-panes.request.js", "settings/home.css"]) await assert.rejects(access(new URL(`../dist/${file}`, import.meta.url)), { code: "ENOENT" });
});

test("each build creates only one module and never overwrites a project landing page", async () => {
    assert.equal(files["settings/index.html"], undefined);
    assert.equal(files["settings/assets/index.html"], undefined);
    assert.equal(files["settings/assets/boxjs.json"], undefined);
    assert.ok(Object.keys(files).every(name => !/\.(json|request.js|config.js)$/.test(name)));
    assert.equal(files["settings/assets/Module.css"], ".pp-panel { color: red; }");
    assert.equal(otherFiles["settings/assets/Other.css"], "");
    assert.equal(files["settings/Other/index.html"], undefined);
    assert.equal(files["settings/assets/app.mjs"], otherFiles["settings/assets/app.mjs"]);
    assert.equal(files["settings/assets/Module.html"], undefined);
    assert.equal(files["settings/assets/navigation.mjs"], undefined);
    await assert.rejects(build({ apps: [document, other] }), /exactly one module/);
    await assert.rejects(build([]), /exactly one module/);
    await assert.rejects(build(document, { stylesheets: [] }));
});

for (const quantumult of [false, true])
    test(`${quantumult ? "Quantumult X" : "Surge"}: module script leaves the landing page, other modules and configuration requests alone`, async () => {
        const store = new Map();
        let reads = 0;
        const api = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");
        const run = (path, method = "GET", body) =>
            new Promise(resolve => {
                const read = key => {
                    reads++;
                    return store.get(key);
                };
                const write = (value, key) => {
                    store.set(key, value);
                    return true;
                };
                vm.runInNewContext(api, {
                    ...(quantumult ? { $task: {}, $prefs: { valueForKey: read, setValueForKey: write } } : { $environment: { "surge-version": "test" }, $persistentStore: { read, write } }),
                    $request: { url: `https://example.org${path}`, method, body, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
                    $script: { startTime: Date.now() / 1000 },
                    $done: result => resolve(quantumult ? result : result.response),
                    console: { log() {}, error() {} },
                });
            });
        const status = value => (quantumult ? Number(value.status.split(" ")[1]) : value.status);
        for (const path of ["/settings/", "/configs/Module"]) {
            const result = await run(path);
            if (quantumult) assert.deepEqual(JSON.parse(JSON.stringify(result)), {});
            else assert.equal(result, undefined);
        }
        assert.equal(reads, 0);
        assert.match((await run("/settings/Module")).body, /<!doctype html>/i);
        for (const asset of ["app.mjs", "navigation.mjs"]) {
            const result = await run(`/settings/assets/${asset}`);
            assert.equal(status(result), 200);
            assert.match(result.body, /PreferencePanes|preference-panes/);
        }
        const host = await run("/settings/assets/host.mjs");
        if (quantumult) assert.deepEqual(JSON.parse(JSON.stringify(host)), {});
        else assert.equal(host, undefined);
        assert.equal(status(await run("/api/set", "POST", "@Root.Module.Settings.unlisted=%7B%22raw%22%3Atrue%7D")), 200);
        assert.equal(status(await run("/api/set", "POST", "@Another.Other.flag=false")), 200);
        assert.equal(status(await run("/api/delete", "POST", "@Root.Module=")), 200);
        assert.equal(JSON.parse(store.get("Another")).Other.flag, false);
    });
