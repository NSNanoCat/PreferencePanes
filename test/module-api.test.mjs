import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { config } from "./fixtures/module.mjs";

const source = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");

function fixture(configuration = JSON.stringify(config)) {
    const storage = new Map([["Example", JSON.stringify({ Module: { Settings: { Home: { enabled: false, mode: "b" }, items: ["a"] }, Caches: { cached: true } }, Other: { enabled: true } })]]);
    const calls = [];
    const state = { error: undefined };
    const run = (method, path, body, headers = {}) =>
        new Promise(resolve => {
            const reply = (options, callback, content) => {
                calls.push(options);
                if (state.error) return callback(state.error);
                callback(null, { status: options.url.endsWith("/configs/Module") ? 200 : 404, headers: { "Content-Type": "application/json", "X-PreferencePanes-Version": "0.9.17" } }, content);
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
                $request: { url: `https://example.test${path}`, method, body, headers },
                $script: { startTime: Date.now() / 1000 },
                $done: result => resolve(result.response),
                $httpClient: {
                    head: (options, callback) => reply(options, callback, ""),
                    get: (options, callback) => reply(options, callback, options.url.endsWith("/configs/Module") ? configuration : ""),
                },
                console: { log() {}, error() {} },
                setTimeout,
                clearTimeout,
                TextDecoder,
            });
        });
    const form = (action, key = "@Example.Module.Settings.Home.enabled", value = "") => run("POST", `/api/${action}`, new URLSearchParams([[key, value]]).toString(), { "Content-Type": "application/x-www-form-urlencoded" });
    return { calls, form, run, state, storage };
}

test("module HEAD probes the BoxJS source through the backend API", async () => {
    const { calls, run } = fixture();
    const result = await run("HEAD", "/api/Module");
    assert.equal(result.status, 200);
    assert.equal(result.body, "");
    assert.equal(result.headers["X-PreferencePanes-Version"], "0.9.17");
    assert.equal(calls[0].url, "https://example.test/configs/Module");
    assert.equal(calls[0].method, "HEAD");
});

test("module GET relays raw BoxJS without parsing or reading storage", async () => {
    const raw = '{"apps":"intentionally invalid BoxJS"}';
    const { calls, run, storage } = fixture(raw);
    const before = storage.get("Example");
    const result = await run("GET", "/api/Module");
    assert.equal(result.status, 200);
    assert.equal(result.body, raw);
    assert.equal(result.headers["Content-Type"], "application/json");
    assert.equal(result.headers["X-PreferencePanes-Version"], "0.9.17");
    assert.equal(calls[0].url, "https://example.test/configs/Module");
    assert.equal(calls[0].method, "GET");
    assert.equal(storage.get("Example"), before);
});

test("module API uses the same-origin configuration and reports transport failure", async () => {
    const { calls, run, state } = fixture();
    await run("GET", "/api/Module", undefined, { "X-PreferencePanes-JSON": "https://cdn.example.test/Module.json" });
    assert.equal(calls[0].url, "https://example.test/configs/Module");
    state.error = new Error("offline");
    assert.equal((await run("GET", "/api/Module")).status, 502);
});

test("fixed form actions use complete paths without downloading BoxJS", async () => {
    const { calls, form, storage } = fixture();
    assert.equal((await form("set", "@Example.Module.Settings.Home.enabled", "true")).status, 200);
    assert.equal(JSON.parse((await form("get")).body), true);
    assert.equal((await form("delete", "@Example.Module.Caches")).status, 200);
    assert.equal((await form("delete", "@Example.Module")).status, 200);
    assert.equal((await form("get")).status, 404);
    assert.equal(calls.length, 0);
    assert.deepEqual(JSON.parse(storage.get("Example")), { Other: { enabled: true } });
});

test("form values preserve JSON types and serialized parent nodes", async () => {
    const { form, storage } = fixture();
    for (const value of [false, 0, "", null, ["a", 1], { nested: true }, "true", "中文"]) {
        assert.equal((await form("set", undefined, JSON.stringify(value))).status, 200);
        assert.deepEqual(JSON.parse((await form("get")).body), value);
    }
    storage.set("Example", JSON.stringify({ Module: { Settings: JSON.stringify({ flag: true }) }, Other: { enabled: true } }));
    assert.equal((await form("set", "@Example.Module.Settings.flag", "false")).status, 200);
    assert.equal(JSON.parse((await form("get", "@Example.Module.Settings.flag")).body), false);
    assert.deepEqual(JSON.parse(storage.get("Example")).Other, { enabled: true });
});

test("invalid form requests fail before storage access", async () => {
    const { run } = fixture();
    for (const body of ["", "@Root.x=a&@Other.x=b", "%ZZ=a", "@Root.__proto__.x=1", "@Root.x.y/=x", "Root.x=x", "@Root=x"]) assert.equal((await run("POST", "/api/set", body, { "Content-Type": "application/x-www-form-urlencoded" })).status, 400, body);
    assert.equal((await run("GET", "/api/get")).status, 405);
    assert.equal((await run("POST", "/api/set", "@Root.x=true")).status, 415);
});

test("removed module action paths and non-API resources pass through", async () => {
    const { calls, run } = fixture();
    for (const path of ["/api/Module/get", "/api/Module/set", "/api/Module/delete", "/settings/Module", "/settings/assets/index.mjs", "/configs/Module"]) assert.equal(await run("GET", path), undefined);
    assert.equal(calls.length, 0);
});
