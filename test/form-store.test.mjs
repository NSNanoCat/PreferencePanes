import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

globalThis.$environment = { "surge-version": "test" };
const data = new Map();
globalThis.$persistentStore = {
    read: key => data.get(key) ?? null,
    write: (value, key) => {
        data.set(key, value);
        return true;
    },
};
const { Store } = await import("../src/Store.mjs");
const store = new Store();
beforeEach(() => data.clear());

test("store reads, writes and removes complete paths through util Storage", () => {
    assert.equal(store.write("@Root.Module.Settings.key", "abcd"), true);
    assert.equal(store.read("@Root.Module.Settings.key"), "abcd");
    assert.equal(store.write("@Other.Plugin.flag", false), true);
    assert.equal(store.read("@Other.Plugin.flag"), false);
    assert.equal(store.remove("@Root.Module.Settings.key"), true);
    assert.equal(store.read("@Root.Module.Settings.key"), undefined);
});

test("store preserves serialized parents and sibling modules", () => {
    data.set("Root", JSON.stringify({ Module: { Settings: JSON.stringify({ flag: true }), Caches: { a: 1 } }, Other: { flag: true } }));
    assert.equal(store.write("@Root.Module.Settings.flag", false), true);
    assert.equal(store.read("@Root.Module.Settings.flag"), false);
    assert.equal(store.remove("@Root.Module.Caches"), true);
    assert.equal(store.remove("@Root.Module"), true);
    assert.deepEqual(JSON.parse(data.get("Root")), { Other: { flag: true } });
});
