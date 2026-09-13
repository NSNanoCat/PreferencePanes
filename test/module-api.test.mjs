import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { config } from "./fixtures/module.mjs";

const source = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");

function fixture(boxjs = config) {
    const storage = new Map([["Example", JSON.stringify({ Module: { Settings: { Home: { enabled: false, mode: "b" }, items: ["a"] }, Caches: { cached: true } }, Other: { enabled: true } })]]);
    const calls = [];
    const run = (method, path, body, headers = {}) =>
        new Promise(resolve => {
            const reply = (options, callback, content) => {
                calls.push(options);
                callback(null, { status: options.url.endsWith("/configs/Module") ? 200 : 404, headers: { "X-PreferencePanes-Version": "0.9.17" } }, content);
            };
            vm.runInNewContext(source, {
                $environment: { "surge-version": "test" },
                $persistentStore: {
                    read: key => storage.get(key) ?? null,
                    write: (value, key) => {
                        storage.set(key, value);
                        return true;
                    },
                },
                $request: { url: `https://example.test${path}`, method, body, headers: { "content-type": "application/json", ...headers } },
                $script: { startTime: Date.now() / 1000 },
                $done: result => resolve(result.response),
                $httpClient: {
                    head: (options, callback) => reply(options, callback, ""),
                    get: (options, callback) => reply(options, callback, options.url.endsWith("/configs/Module") ? JSON.stringify(boxjs) : ""),
                },
                console: { log() {}, error() {} },
                setTimeout,
                clearTimeout,
            });
        });
    return { calls, run, storage };
}

test("module HEAD probes the BoxJS source through the backend API", async () => {
    const { calls, run } = fixture();
    const result = await run("HEAD", "/api/Module");
    assert.equal(result.status, 200);
    assert.equal(result.headers["X-PreferencePanes-Version"], "0.9.17");
    assert.equal(calls[0].url, "https://example.test/configs/Module");
    assert.equal(calls[0].method, "HEAD");
});

test("module GET returns raw BoxJS and values read directly through util Storage", async () => {
    const { run } = fixture();
    const result = await run("GET", "/api/Module");
    const body = JSON.parse(result.body);
    assert.deepEqual(body.boxjs, config);
    assert.equal(body.values["Module.Settings.Home.enabled"], false);
    assert.equal(body.values["Module.Settings.Home.mode"], "b");
    assert.equal(body.configURL, "https://example.test/configs/Module");
});

test("module GET accepts an explicit JSON source header", async () => {
    const { calls, run } = fixture();
    await run("GET", "/api/Module", undefined, { "X-PreferencePanes-JSON": "https://cdn.example.test/Module.json" });
    assert.equal(calls[0].url, "https://cdn.example.test/Module.json");
});

test("module API rejects non-HTTP BoxJS sources before transport", async () => {
    const { calls, run } = fixture();
    const result = await run("GET", "/api/Module", undefined, { "X-PreferencePanes-JSON": "file:///tmp/Module.json" });
    assert.equal(result.status, 400);
    assert.equal(calls.length, 0);
});

test("module API does not validate browser control semantics", async () => {
    const invalidControl = [{ ...config[0], type: "unsupported" }];
    const { run } = fixture(invalidControl);
    const result = await run("GET", "/api/Module");
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body).boxjs, invalidControl);
});

test("module actions use BoxJS field IDs with util Storage deep paths", async () => {
    const { run, storage } = fixture();
    assert.equal((await run("POST", "/api/Module/set", JSON.stringify({ key: "Module.Settings.Home.enabled", value: true }))).status, 200);
    assert.equal(JSON.parse((await run("POST", "/api/Module/get", JSON.stringify({ scope: "settings" }))).body).Home.enabled, "true");
    assert.equal((await run("POST", "/api/Module/delete", JSON.stringify({ scope: "caches" }))).status, 200);
    assert.equal((await run("POST", "/api/Module/delete", JSON.stringify({ scope: "module" }))).status, 200);
    assert.deepEqual(JSON.parse(storage.get("Example")), { Other: { enabled: true } });
});

test("module API rejects unknown BoxJS fields before writing storage", async () => {
    const { run, storage } = fixture();
    const before = storage.get("Example");
    const result = await run("POST", "/api/Module/set", JSON.stringify({ key: "Module.Settings.Unknown", value: true }));
    assert.equal(result.status, 400);
    assert.equal(storage.get("Example"), before);
});

test("module API persists browser-validated JSON values without interpreting controls", async () => {
    const { run } = fixture();
    const value = { raw: true };
    assert.equal((await run("POST", "/api/Module/set", JSON.stringify({ key: "Module.Settings.Home.enabled", value }))).status, 200);
    const result = await run("POST", "/api/Module/get", JSON.stringify({ key: "Module.Settings.Home.enabled" }));
    assert.deepEqual(JSON.parse(result.body), value);
});

test("backend API passes through pages and static resources", async () => {
    const { run } = fixture();
    for (const path of ["/settings/Module", "/settings/assets/index.mjs", "/configs/Module"]) assert.equal(await run("GET", path), undefined);
});
