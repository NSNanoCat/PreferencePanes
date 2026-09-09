import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const data = new Map();
let writes = 0,
    reads = 0,
    writable = true;
globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = {
    read(key) {
        reads++;
        return data.get(key) ?? null;
    },
    write(value, key) {
        writes++;
        if (!writable) return false;
        data.set(key, value);
        return true;
    },
};
globalThis.$httpClient = {
    get() {
        throw Error("API must not download configuration");
    },
};
const { Store } = await import("../src/Store.mjs");
const handler = new Store();
const request = (action, key = "@Root.Module.Settings.key", value = "") => ({
    url: `https://example.org/api/${action}`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams([[key, value]]).toString(),
});
beforeEach(() => {
    data.clear();
    writes = reads = 0;
    writable = true;
});

test("form get/set/delete uses full keys without authentication or BoxJS binding", async () => {
    assert.equal((await handler.handle(request("set", "@Root.Module.Settings.key", "abcd"))).status, 200);
    assert.equal((await handler.handle(request("get"))).body, '"abcd"');
    assert.equal((await handler.handle(request("set", "@Other.Plugin.flag", "true"))).status, 200);
    assert.equal((await handler.handle(request("get", "@Other.Plugin.flag"))).body, "true");
    assert.equal((await handler.handle({ ...request("get"), headers: { ...request("get").headers, Origin: "https://another.example" } })).status, 200);
    assert.equal((await handler.handle(request("delete"))).status, 200);
    assert.equal((await handler.handle(request("get"))).status, 404);
});

test("typed values and form escapes survive without control validation", async () => {
    for (const value of [false, 0, "", null, ["a", 1], { nested: true }, "a+b&c=d", "true", "中文"]) {
        assert.equal((await handler.handle(request("set", undefined, JSON.stringify(value)))).status, 200);
        assert.deepEqual(JSON.parse((await handler.handle(request("get"))).body), value);
    }
    assert.equal((await handler.handle({ ...request("set"), body: "@Root.Module.Settings.key=a+b%2Bc%26d%3De" })).status, 200);
    assert.equal(JSON.parse((await handler.handle(request("get"))).body), "a b+c&d=e");
});

test("subtrees and serialized parents preserve sibling modules", async () => {
    data.set("Root", JSON.stringify({ Module: { Settings: JSON.stringify({ flag: true }), Caches: { a: 1 } }, Other: { flag: true } }));
    assert.equal((await handler.handle(request("set", "@Root.Module.Settings.flag", "false"))).status, 200);
    assert.equal((await handler.handle(request("get", "@Root.Module.Settings.flag"))).body, "false");
    await handler.handle(request("delete", "@Root.Module.Caches"));
    await handler.handle(request("delete", "@Root.Module"));
    assert.deepEqual(JSON.parse(data.get("Root")), { Other: { flag: true } });
});

test("invalid transport and paths fail before accessing persistence", async () => {
    for (const body of ["", "@Root.x=a&@Other.x=b", "%ZZ=a", "@Root.__proto__.x=1", "@Root.x.y/=x", "Root.x=x", "@Root=x"]) {
        assert.equal((await handler.handle({ ...request("set"), body })).status, 400, body);
    }
    assert.equal((await handler.handle({ ...request("get"), method: "GET" })).status, 405);
    assert.equal((await handler.handle({ ...request("set"), headers: {} })).status, 415);
    assert.equal((await handler.handle(request("old-path"))).status, 404);
    assert.equal(reads, 0);
    assert.equal(writes, 0);
    writable = false;
    assert.equal((await handler.handle(request("set", undefined, "true"))).status, 500);
});
