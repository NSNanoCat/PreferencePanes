import assert from "node:assert/strict";
import test from "node:test";
import { ModuleApi } from "../src/ModuleApi.mjs";
import { config } from "./fixtures/module.mjs";

function fixture() {
    const values = { "@Example.Module.Settings": { Home: { enabled: false, mode: "b" }, items: ["a"] }, "@Example.Module.Caches": { cached: true } };
    const calls = [];
    const writes = [];
    const store = {
        read(path) {
            return values[path];
        },
        write(path, value) {
            writes.push(["write", path, value]);
            values[path] = value;
            return true;
        },
        remove(path) {
            writes.push(["remove", path]);
            delete values[path];
            return true;
        },
    };
    const fetch = async request => {
        calls.push(request);
        return { status: 200, body: JSON.stringify(config), headers: { "X-PreferencePanes-Version": "0.9.17" } };
    };
    return { api: new ModuleApi({ fetch, store }), calls, writes };
}

function request(method, path, body, headers = {}) {
    return { url: `https://example.test${path}`, method, body, headers: { "content-type": "application/json", ...headers } };
}

test("module HEAD probes the BoxJS source through the proxy API", async () => {
    const { api, calls } = fixture();
    const result = await api.handle(request("HEAD", "/api/module/Module"), new URL("https://example.test/api/module/Module"));
    assert.equal(result.status, 200);
    assert.equal(result.headers["X-PreferencePanes-Version"], "0.9.17");
    assert.deepEqual(calls[0], { url: "https://example.test/configs/Module", method: "HEAD", timeout: 5000, headers: { Accept: "application/json" } });
});

test("module GET loads and normalizes BoxJS before returning values", async () => {
    const { api } = fixture();
    const result = await api.handle(request("GET", "/api/module/Module"), new URL("https://example.test/api/module/Module"));
    const body = JSON.parse(result.body);
    assert.equal(body.module, "Module");
    assert.equal(body.definition.storageKey, "Example");
    assert.equal(body.values["Module.Settings.Home.enabled"], false);
    assert.equal(body.values["Module.Settings.Home.mode"], "b");
});

test("module GET accepts an explicit JSON source header", async () => {
    const { api, calls } = fixture();
    await api.handle(request("GET", "/api/module/Module", undefined, { "X-PreferencePanes-JSON": "https://cdn.example.test/Module.json" }), new URL("https://example.test/api/module/Module"));
    assert.equal(calls[0].url, "https://cdn.example.test/Module.json");
});

test("module mutations map field paths and scopes on the API side", async () => {
    const { api, writes } = fixture();
    const base = new URL("https://example.test/api/module/Module");
    const set = await api.handle(request("POST", "/api/module/Module/set", JSON.stringify({ key: "Module.Settings.Home.enabled", value: true })), new URL(`${base}/set`));
    const get = await api.handle(request("POST", "/api/module/Module/get", JSON.stringify({ scope: "settings" })), new URL(`${base}/get`));
    const clear = await api.handle(request("POST", "/api/module/Module/delete", JSON.stringify({ scope: "caches" })), new URL(`${base}/delete`));
    const reset = await api.handle(request("POST", "/api/module/Module/delete", JSON.stringify({ scope: "module" })), new URL(`${base}/delete`));
    assert.equal(set.status, 200);
    assert.equal(get.status, 200);
    assert.equal(clear.status, 200);
    assert.equal(reset.status, 200);
    assert.deepEqual(writes, [
        ["write", "@Example.Module.Settings.Home.enabled", true],
        ["remove", "@Example.Module.Caches"],
        ["remove", "@Example.Module"],
    ]);
});

test("module API rejects unknown BoxJS fields before touching storage", async () => {
    const { api, writes } = fixture();
    const result = await api.handle(request("POST", "/api/module/Module/set", JSON.stringify({ key: "Module.Settings.Unknown", value: true })), new URL("https://example.test/api/module/Module/set"));
    assert.equal(result.status, 400);
    assert.equal(writes.length, 0);
});
