import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBoxJs } from "../src/browser/boxjs.mjs";
import { PreferencesClient } from "../src/browser/client.mjs";
import { config } from "./fixtures/module.mjs";

const definition = normalizeBoxJs(config, "Module");
const settings = { Home: { enabled: false, mode: "b" }, items: ["a", "b"], note: "", count: "2" };

test("browser client reads Settings once, normalizes stored values and then mutates its snapshot", async () => {
    const calls = [];
    const client = new PreferencesClient({
        definition,
        fetch: async (url, options) => {
            calls.push({ url, ...options });
            return new Response(calls.length === 1 ? JSON.stringify(settings) : JSON.stringify({}), { status: 200 });
        },
    });
    assert.deepEqual(await client.open(), {
        definition,
        values: { "Module.Settings.Home.enabled": false, "Module.Settings.Home.mode": "b", "Module.Settings.items": ["a", "b"], "Module.Settings.note": "", "Module.Settings.count": 2 },
    });
    await client.set("Module.Settings.Home.mode", "a");
    assert.deepEqual(
        calls.map(call => [call.method, call.url, JSON.parse(call.body)]),
        [
            ["POST", "/api/Module/get", { scope: "settings" }],
            ["POST", "/api/Module/set", { key: "Module.Settings.Home.mode", value: "a" }],
        ],
    );
    assert.deepEqual(calls[0].headers, { "Content-Type": "application/json" });
    assert.equal(client.snapshot().values["Module.Settings.Home.mode"], "a");
});

test("missing Settings initializes the page from BoxJS defaults", async () => {
    const client = new PreferencesClient({ definition, fetch: async () => new Response(null, { status: 404 }) });
    assert.deepEqual((await client.open()).values, {
        "Module.Settings.Home.enabled": true,
        "Module.Settings.Home.mode": "a",
        "Module.Settings.items": ["a"],
        "Module.Settings.note": "",
        "Module.Settings.count": 1,
    });
});

test("settings and caches are read through module API actions", async () => {
    const calls = [];
    const client = new PreferencesClient({
        definition,
        fetch: async (url, options) => {
            calls.push({ url, ...options });
            const scope = JSON.parse(options.body).scope;
            return scope === "caches" ? new Response(JSON.stringify({ items: [1, 2] }), { status: 200 }) : new Response(JSON.stringify({ count: 7 }), { status: 200 });
        },
    });
    assert.deepEqual(await client.readSettings(), { count: 7 });
    assert.deepEqual(await client.readCaches(), { items: [1, 2] });
    assert.deepEqual(
        calls.map(call => [call.method, call.url, JSON.parse(call.body)]),
        [
            ["POST", "/api/Module/get", { scope: "settings" }],
            ["POST", "/api/Module/get", { scope: "caches" }],
        ],
    );
});

test("successful mutations update the page cache without rereading", async () => {
    const notifications = [];
    let calls = 0;
    const client = new PreferencesClient({ definition, notify: event => notifications.push(event), fetch: async () => new Response(++calls === 1 ? JSON.stringify(settings) : JSON.stringify({}), { status: 200 }) });
    await client.open();
    await client.set("Module.Settings.Home.mode", "a");
    await client.remove("Module.Settings.items");
    await client.clearCaches();
    await client.reset();
    assert.equal(client.snapshot().values["Module.Settings.Home.mode"], "a");
    assert.deepEqual(
        notifications.map(event => event.operation),
        ["write", "delete", "clearCaches", "reset"],
    );
    assert.equal(calls, 5);
});

test("API errors notify and preserve the cached snapshot", async () => {
    const notifications = [];
    let calls = 0;
    const client = new PreferencesClient({ definition, notify: event => notifications.push(event), fetch: async () => new Response(++calls === 1 ? JSON.stringify(settings) : null, { status: calls === 1 ? 200 : 500 }) });
    await client.open();
    const before = client.snapshot();
    await assert.rejects(client.set("Module.Settings.count", 2), /HTTP 500/);
    assert.deepEqual(client.snapshot(), before);
    assert.equal(notifications.at(-1).kind, "error");
});

test("invalid stored values fail initialization and can be retried", async () => {
    let calls = 0;
    const client = new PreferencesClient({
        definition,
        fetch: async () => new Response(JSON.stringify(++calls === 1 ? { ...settings, count: "not-a-number" } : settings), { status: 200 }),
    });
    await assert.rejects(client.open(), /Invalid stored value: Module\.Settings\.count/);
    assert.equal((await client.open()).values["Module.Settings.count"], 2);
});

test("a timed out request does not abort later API actions", async () => {
    let calls = 0;
    const client = new PreferencesClient({
        definition,
        timeout: 5,
        fetch: (_url, options) => {
            calls++;
            if (calls === 1) return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
            return Promise.resolve(new Response(null, { status: 200 }));
        },
    });
    await assert.rejects(client.set("Module.Settings.count", 2));
    await client.set("Module.Settings.count", 3);
    assert.equal(client.snapshot().values["Module.Settings.count"], 3);
});
