import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");

function fixture() {
    const storage = new Map([["Example", JSON.stringify({ Module: { Settings: { Home: { enabled: false, mode: "b" }, items: ["a"] }, Caches: { cached: true } }, Other: { enabled: true } })]]);
    const run = (method, path, body, headers = {}) =>
        new Promise(resolve => {
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
                console: { log() {}, error() {} },
            });
        });
    const form = (action, key = "@Example.Module.Settings.Home.enabled", value = "") => run("POST", `/api/${action}`, new URLSearchParams([[key, value]]).toString(), { "Content-Type": "application/x-www-form-urlencoded" });
    return { form, run, storage };
}

test("fixed form actions use complete paths without downloading BoxJS", async () => {
    const { form, storage } = fixture();
    assert.equal((await form("set", "@Example.Module.Settings.Home.enabled", "true")).status, 200);
    assert.equal(JSON.parse((await form("get")).body), true);
    assert.equal((await form("delete", "@Example.Module.Caches")).status, 200);
    assert.equal((await form("delete", "@Example.Module")).status, 200);
    assert.equal((await form("get")).status, 404);
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
    const { run } = fixture();
    for (const [method, path] of [
        ["HEAD", "/api/Module"],
        ["GET", "/api/Module"],
        ["POST", "/api/Module/get"],
        ["POST", "/api/Module/set"],
        ["POST", "/api/Module/delete"],
        ["GET", "/settings/Module"],
        ["GET", "/settings/assets/index.mjs"],
        ["GET", "/configs/Module"],
        ["POST", "/api/get/"],
    ])
        assert.equal(await run(method, path), undefined, `${method} ${path}`);
});
