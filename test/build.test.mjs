import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("public browser exposes only the generic BoxJS mount contract", async () => {
    assert.deepEqual(Object.keys(await import("../src/index.mjs")), []);
    assert.deepEqual(Object.keys(await import("../dist/preference-panes.mjs")), ["mount"]);
    assert.deepEqual(Object.keys(await import("@nsnanocat/preference-panes/navigation")), ["ActionMenu", "ModuleFrame", "ModuleStatus", "Navigation", "probeModule"]);
    const { ActionMenu } = await import("@nsnanocat/preference-panes/navigation");
    assert.equal(typeof ActionMenu.prototype.open, "function");
    const browser = await readFile(new URL("../dist/preference-panes.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(browser, /node:fs|node-fetch|\$persistentStore|@nsnanocat\/util/);
    assert.doesNotMatch(browser, /pp-home|self-panel|pp-install|安装模块|data-module/);
    const navigation = await readFile(new URL("../dist/module/navigation.mjs", import.meta.url), "utf8");
    assert.match(navigation, /\*,\*::before,\*::after\{box-sizing:border-box\}/);
    assert.match(navigation, /#sheet\{[^}]*width:100%;max-width:540px/);
    for (const file of ["preference-panes.request.js", "settings/home.css", "settings/assets/app.mjs"]) await assert.rejects(access(new URL(`../dist/${file}`, import.meta.url)), { code: "ENOENT" });
    for (const path of ["../dist/preference-panes.mjs", "../dist/module/index.mjs", "../dist/api.js", "../dist/web.js"]) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /ModuleModel|configURL|X-PreferencePanes-JSON|settings\/assets\/app\.mjs/);
    }
    assert.match(await readFile(new URL("../dist/web.js", import.meta.url), "utf8"), /x-preferencepanes-css/i);
    const page = await readFile(new URL("../dist/module/index.mjs", import.meta.url), "utf8");
    assert.match(page, /\/api\//);
    assert.doesNotMatch(page, /\/configs\//);
});

const hosts = [
    { name: "Surge", globals: { $environment: { "surge-version": "test" } } },
    { name: "Loon", globals: { $loon: {} } },
    { name: "Stash", globals: { $environment: { "stash-version": "test" } } },
    { name: "Shadowrocket", globals: { $rocket: {} } },
    { name: "Egern", globals: { Egern: {} } },
    { name: "Quantumult X", quantumult: true, globals: {} },
];

for (const host of hosts)
    test(`${host.name}: backend API leaves pages, assets and configuration requests alone`, async () => {
        const store = new Map();
        let reads = 0;
        const api = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");
        const run = (path, method = "GET", body = undefined, headers = {}) =>
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
                    ...(host.quantumult ? { $task: {}, $prefs: { valueForKey: read, setValueForKey: write } } : { ...host.globals, $persistentStore: { read, write } }),
                    $request: { url: `https://example.org${path}`, method, body, headers },
                    $script: { startTime: Date.now() / 1000 },
                    $done: result => resolve(host.quantumult ? result : result.response),
                    console: { log() {}, error() {} },
                });
            });
        const status = value => (host.quantumult ? Number(value.status.split(" ")[1]) : value.status);
        for (const path of ["/settings/", "/configs/Module", "/settings/Module", "/settings/assets/index.mjs", "/settings/assets/navigation.mjs", "/settings/assets/app.mjs", "/settings/assets/host.mjs"]) {
            const result = await run(path);
            if (host.quantumult) assert.deepEqual(JSON.parse(JSON.stringify(result)), {});
            else assert.equal(result, undefined);
        }
        assert.equal(reads, 0);
        for (const [method, path] of [
            ["HEAD", "/api/Module"],
            ["GET", "/api/Module"],
            ["POST", "/api/Module/get"],
            ["POST", "/api/get/"],
        ]) {
            const result = await run(path, method);
            if (host.quantumult) assert.deepEqual(JSON.parse(JSON.stringify(result)), {});
            else assert.equal(result, undefined);
        }
        const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };
        assert.equal(status(await run("/api/set", "POST", new URLSearchParams([["@Example.Module.Settings.Home.enabled", JSON.stringify({ raw: true })]]).toString(), formHeaders)), 200);
        assert.equal(status(await run("/api/delete", "POST", new URLSearchParams([["@Example.Module", ""]]).toString(), formHeaders)), 200);
    });

test("built backend contains no module configuration transport", async () => {
    const api = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");
    assert.doesNotMatch(api, /\$httpClient|\$task\.fetch|\/configs\/|X-PreferencePanes-Version|TextDecoder|timeout:\s*5000/);
});
