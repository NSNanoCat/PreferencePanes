import assert from "node:assert/strict";
import test from "node:test";
import { ModuleApi } from "../src/ModuleApi.mjs";
import { config } from "./fixtures/module.mjs";

function fixture() {
    const settings = { Home: { enabled: false, mode: "b" }, items: ["a"] };
    const values = { "@Example.Module": { Settings: settings, Caches: { cached: true } }, "@Example.Module.Settings": settings, "@Example.Module.Caches": { cached: true } };
    const calls = [];
    const writes = [];
    const store = {
        read: path => values[path],
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
    const result = await api.handle(request("HEAD", "/api/Module"), new URL("https://example.test/api/Module"));
    assert.equal(result.status, 200);
    assert.equal(result.headers["X-PreferencePanes-Version"], "0.9.17");
    assert.deepEqual(calls[0], { url: "https://example.test/configs/Module", method: "HEAD", timeout: 5000, headers: { Accept: "application/json" } });
});

test("module GET returns raw BoxJS and API-read values", async () => {
    const { api } = fixture();
    const result = await api.handle(request("GET", "/api/Module"), new URL("https://example.test/api/Module"));
    const body = JSON.parse(result.body);
    assert.deepEqual(body.boxjs, config);
    assert.equal(body.values["Module.Settings.Home.enabled"], false);
    assert.equal(body.values["Module.Settings.Home.mode"], "b");
    assert.equal(body.configURL, "https://example.test/configs/Module");
});

test("module GET accepts an explicit JSON source header", async () => {
    const { api, calls } = fixture();
    await api.handle(request("GET", "/api/Module", undefined, { "X-PreferencePanes-JSON": "https://cdn.example.test/Module.json" }), new URL("https://example.test/api/Module"));
    assert.equal(calls[0].url, "https://cdn.example.test/Module.json");
});

test("module API rejects non-HTTP BoxJS sources before transport", async () => {
    const { api, calls } = fixture();
    const result = await api.handle(request("GET", "/api/Module", undefined, { "X-PreferencePanes-JSON": "file:///tmp/Module.json" }), new URL("https://example.test/api/Module"));
    assert.equal(result.status, 400);
    assert.equal(calls.length, 0);
});

test("module API does not validate browser control semantics", async () => {
    const invalidControl = [{ ...config[0], type: "unsupported" }];
    const result = await new ModuleApi({
        fetch: async () => ({ status: 200, body: JSON.stringify(invalidControl), headers: {} }),
        store: { read: () => undefined },
    }).handle(request("GET", "/api/Module"), new URL("https://example.test/api/Module"));
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body).boxjs, invalidControl);
});

test("module mutations map field paths and scopes on the API side", async () => {
    const { api, writes } = fixture();
    const base = "https://example.test/api/Module";
    assert.equal((await api.handle(request("POST", "/api/Module/set", JSON.stringify({ key: "Module.Settings.Home.enabled", value: true })), new URL(`${base}/set`))).status, 200);
    assert.equal((await api.handle(request("POST", "/api/Module/get", JSON.stringify({ scope: "settings" })), new URL(`${base}/get`))).status, 200);
    assert.equal((await api.handle(request("POST", "/api/Module/delete", JSON.stringify({ scope: "caches" })), new URL(`${base}/delete`))).status, 200);
    assert.equal((await api.handle(request("POST", "/api/Module/delete", JSON.stringify({ scope: "module" })), new URL(`${base}/delete`))).status, 200);
    assert.deepEqual(writes, [
        ["write", "@Example.Module.Settings.Home.enabled", true],
        ["remove", "@Example.Module.Caches"],
        ["remove", "@Example.Module"],
    ]);
});

test("module API rejects unknown BoxJS fields before touching storage", async () => {
    const { api, writes } = fixture();
    const result = await api.handle(request("POST", "/api/Module/set", JSON.stringify({ key: "Module.Settings.Unknown", value: true })), new URL("https://example.test/api/Module/set"));
    assert.equal(result.status, 400);
    assert.equal(writes.length, 0);
});

test("module API persists browser-validated values without interpreting their control type", async () => {
    const { api, writes } = fixture();
    const value = { raw: true };
    const result = await api.handle(request("POST", "/api/Module/set", JSON.stringify({ key: "Module.Settings.Home.enabled", value })), new URL("https://example.test/api/Module/set"));
    assert.equal(result.status, 200);
    assert.deepEqual(writes, [["write", "@Example.Module.Settings.Home.enabled", value]]);
});
