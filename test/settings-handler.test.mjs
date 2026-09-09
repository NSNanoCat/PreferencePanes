import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const store = new Map();
let reads = 0,
    writes = 0,
    writable = true;
globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = {
    read(key) {
        reads++;
        return store.get(key) ?? null;
    },
    write(value, key) {
        writes++;
        if (!writable) return false;
        store.set(key, value);
        return true;
    },
};
globalThis.$httpClient = {
    get() {
        throw new Error("Storage API must not fetch configuration");
    },
};
const { SettingsHandler, parseSettingsPath } = await import("../src/index.mjs");
const options = { origin: "https://example.org", storageKey: "Root", module: "Module" };
const req = (method, path = "Module/Settings/key", body = undefined) => ({
    url: `https://example.org/api/${path}`,
    method,
    headers: { "X-Settings-Client": "1", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeEach(() => {
    store.clear();
    reads = writes = 0;
    writable = true;
});

test("GET returns the full addressed value including Caches and undeclared keys", async () => {
    const data = { Module: { Settings: { key: "value", hidden: 7 }, Caches: { list: [1, 2] } }, Other: { secret: true } };
    store.set("Root", JSON.stringify(data));
    const handler = new SettingsHandler(options);
    assert.deepEqual(JSON.parse((await handler.handle(req("GET", "Module/"))).body), data.Module);
    assert.equal(reads, 1);
    assert.deepEqual(JSON.parse((await handler.handle(req("GET", "Module/Caches"))).body), data.Module.Caches);
    assert.equal((await handler.handle(req("GET", "Module/missing"))).status, 404);
    const count = reads;
    assert.equal((await handler.handle(req("GET", "Other/Settings/key"))).status, 404);
    assert.equal(reads, count);
    assert.equal(writes, 0);
});

test("POST replaces any JSON value without BoxJS field or enum validation", async () => {
    const handler = new SettingsHandler(options);
    store.set("Root", JSON.stringify({ Other: { sentinel: 7 } }));
    for (const value of ["not-an-enum", false, 0, "", null, [], [1, 1], { nested: { enabled: true }, list: [null, 2] }]) {
        assert.equal((await handler.handle(req("POST", "Module/New/key", value))).status, 200);
        assert.deepEqual(JSON.parse((await handler.handle(req("GET", "Module/New/key"))).body), value);
    }
    assert.equal((await handler.handle(req("POST", "Module/", { Settings: {}, Caches: { x: 1 } }))).status, 200);
    assert.deepEqual(JSON.parse(store.get("Root")), { Other: { sentinel: 7 }, Module: { Settings: {}, Caches: { x: 1 } } });
});

test("DELETE clears Caches or resets the module without touching sibling modules", async () => {
    const handler = new SettingsHandler(options);
    store.set("Root", JSON.stringify({ Module: { Settings: { key: 1 }, Caches: { large: [1, 2] }, hidden: 3 }, Other: { sentinel: 7 } }));
    assert.equal((await handler.handle(req("DELETE", "Module/Caches"))).status, 200);
    assert.deepEqual(JSON.parse(store.get("Root")), { Module: { Settings: { key: 1 }, hidden: 3 }, Other: { sentinel: 7 } });
    assert.equal((await handler.handle(req("GET", "Module/Caches"))).status, 404);
    assert.equal((await handler.handle(req("DELETE", "Module/"))).status, 200);
    assert.deepEqual(JSON.parse(store.get("Root")), { Other: { sentinel: 7 } });
    assert.equal((await handler.handle(req("GET", "Module/"))).status, 404);
    assert.equal((await handler.handle(req("DELETE", "Module/"))).status, 200);
    assert.equal(writes, 3);
});

test("HEAD checks routing without reading storage or requiring an existing value", async () => {
    const handler = new SettingsHandler(options);
    for (const path of ["Module/", "Module/Caches", "Module/missing"]) {
        const response = await handler.handle(req("HEAD", path));
        assert.equal(response.status, 200);
        assert.equal(response.body, "");
    }
    assert.equal(reads, 0);
    assert.equal(writes, 0);
    for (const path of ["/configs/Module", "/settings/Module"]) assert.equal(await handler.handle({ ...req("GET"), url: "https://example.org" + path }), undefined);
});

test("legacy serialized parents and array elements retain values during path writes", async () => {
    const handler = new SettingsHandler(options);
    store.set("Root", JSON.stringify({ Module: { Settings: JSON.stringify({ nested: { old: 1 } }), Caches: { items: [{ value: 1 }] } } }));
    assert.equal((await handler.handle(req("POST", "Module/Settings/nested/new", false))).status, 200);
    assert.deepEqual(JSON.parse(store.get("Root")).Module.Settings, { nested: { old: 1, new: false } });
    assert.equal((await handler.handle(req("POST", "Module/Caches/items/0/value", 2))).status, 200);
    assert.equal(JSON.parse((await handler.handle(req("GET", "Module/Caches/items/0/value"))).body), 2);
    assert.equal((await handler.handle(req("POST", "Module", null))).status, 200);
    assert.equal((await handler.handle(req("POST", "Module/child", 1))).status, 500);
    assert.equal(JSON.parse(store.get("Root")).Module, null);
});

test("transport validation and storage failures do not report success", async () => {
    const handler = new SettingsHandler(options);
    assert.equal((await handler.handle({ ...req("GET"), headers: {} })).status, 403);
    assert.equal((await handler.handle({ ...req("POST"), headers: { "X-Settings-Client": "1", "Content-Type": "text/plain" }, body: "1" })).status, 415);
    assert.equal((await handler.handle({ ...req("POST"), body: "{" })).status, 400);
    assert.equal((await handler.handle({ ...req("POST"), body: " ".repeat(65537) })).status, 413);
    assert.equal((await handler.handle(req("PATCH"))).status, 405);
    for (const path of ["Module/__proto__/x", "Module//key", "Module/%ZZ"]) assert.equal((await handler.handle(req("POST", path, 1))).status, 400);
    assert.equal(reads, 0);
    assert.equal(writes, 0);
    writable = false;
    assert.equal((await handler.handle(req("POST", undefined, 1))).status, 500);
    assert.equal(store.size, 0);
});

test("installed root and module are required and never taken from browser headers", async () => {
    for (const storageKey of [undefined, "", "@Root.Other"]) assert.throws(() => new SettingsHandler({ ...options, storageKey }));
    assert.throws(() => new SettingsHandler({ ...options, module: "Other/path" }));
    assert.throws(() => new SettingsHandler({ ...options, origin: "http://example.org" }));
    const handler = new SettingsHandler(options);
    await handler.handle({ ...req("POST", undefined, 9), headers: { ...req("POST").headers, storageKey: "OtherRoot" } });
    assert.equal(store.has("OtherRoot"), false);
    assert.equal(JSON.parse(store.get("Root")).Module.Settings.key, 9);
});

test("paths preserve decoding and reject unsafe segments", () => {
    assert.deepEqual(parseSettingsPath("https://example.org/api/%4Dodule/Settings/key/"), ["Module", "Settings", "key"]);
    for (const path of ["", "Module//", "Module/a%2fb", "Module/__proto__/x"]) assert.throws(() => parseSettingsPath("https://example.org/api/" + path));
});

test("one standalone installation routes allowed modules and preserves their storage boundaries", async () => {
    const handler = new SettingsHandler({ ...options, module: ["Module", "Other"] });
    assert.throws(() => new SettingsHandler({ ...options, module: [] }));
    assert.throws(() => new SettingsHandler({ ...options, module: ["Module", "__proto__"] }));
    assert.equal((await handler.handle(req("POST", "Module/Settings/key", 1))).status, 200);
    assert.equal((await handler.handle(req("POST", "Other/Settings/key", 2))).status, 200);
    assert.equal(JSON.parse((await handler.handle(req("GET", "Other/Settings/key"))).body), 2);
    assert.equal((await handler.handle(req("POST", "Unknown/Settings/key", 3))).status, 404);
    assert.equal((await handler.handle(req("DELETE", "Module/"))).status, 200);
    assert.deepEqual(JSON.parse(store.get("Root")), { Other: { Settings: { key: 2 } } });
});
