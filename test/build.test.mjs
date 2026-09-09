import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "../src/index.mjs";
import { config } from "./fixtures/module.mjs";

const document = {
    name: "Example",
    apps: [
        { name: "First", settings: config },
        { name: "Other", settings: [{ id: "@Another.Other.Settings.flag", name: "Flag", type: "boolean", val: true }] },
    ],
};
const files = await build(document, ":root { --accent: red; }");

test("two inputs produce all resources and independent config Mocks", async () => {
    assert.deepEqual(JSON.parse(files["settings/assets/boxjs.json"]), document);
    assert.equal(files["settings/assets/custom.css"], ":root { --accent: red; }");
    assert.equal((await build(document))["settings/assets/custom.css"], "");
    assert.equal(files["settings/Module/index.html"], files["settings/Other/index.html"]);
    assert.ok(files["settings/assets/Module.config.js"]);
    assert.ok(files["settings/assets/Other.config.js"]);
    assert.ok(Object.keys(files).every(path => !/proxies|site\.boxjs|install\.json/.test(path)));
    await assert.rejects(build({ origin: "https://example.org", storageKey: "Root", module: "Module" }));
    await assert.rejects(build(document, { stylesheets: [] }));
});

for (const quantumult of [false, true])
    test(`${quantumult ? "Quantumult X" : "Surge"}: generated runtime derives roots and needs no arguments or network`, async () => {
        const store = new Map();
        let reads = 0;
        const run = (pathname, method = "GET", body, script = files["settings/assets/PreferencePanes.request.js"]) =>
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
                    ...(quantumult
                        ? {
                              $task: {
                                  fetch() {
                                      throw Error("No network");
                                  },
                              },
                              $prefs: { valueForKey: read, setValueForKey: write },
                          }
                        : { $environment: { "surge-version": "test" }, $persistentStore: { read, write } }),
                    $request: { url: `https://different-host.org${pathname}`, method, headers: { "X-Settings-Client": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) },
                    $script: { startTime: Date.now() / 1000 },
                    $done: result => resolve(quantumult ? result : result.response),
                    console: { log() {}, error() {} },
                });
            });
        const status = value => (quantumult ? Number(value.status.split(" ")[1]) : value.status);
        const unhandled = await run("/configs/Module", "HEAD");
        if (quantumult) assert.deepEqual(JSON.parse(JSON.stringify(unhandled)), {});
        else assert.equal(unhandled, undefined);
        assert.equal(reads, 0);
        assert.match((await run("/settings/Module")).body, /<!doctype html>/i);
        assert.deepEqual(JSON.parse((await run("/settings/assets/boxjs.json")).body), document);
        assert.equal((await run("/settings/assets/custom.css")).body, ":root { --accent: red; }");
        assert.equal(reads, 0);
        assert.equal(status(await run("/api/Module/Settings/unlisted", "POST", { raw: true })), 200);
        assert.equal(status(await run("/api/Other/Settings/flag", "POST", false)), 200);
        assert.deepEqual(JSON.parse(store.get("Example")).Module.Settings.unlisted, { raw: true });
        assert.equal(JSON.parse(store.get("Another")).Other.Settings.flag, false);
        assert.equal(status(await run("/api/Unknown/Settings/key", "POST", 1)), 404);
        assert.equal(status(await run("/api/Module/", "DELETE")), 200);
        assert.equal(JSON.parse(store.get("Another")).Other.Settings.flag, false);
        const mock = await run("/configs/Module", "GET", undefined, files["settings/assets/Module.config.js"]);
        assert.equal(status(mock), 200);
        assert.equal(JSON.parse(mock.body).apps[0].settings.length, config.length);
    });
