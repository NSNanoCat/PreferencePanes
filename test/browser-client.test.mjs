import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBoxJs } from "../src/browser/boxjs.mjs";
import { createPreferencesClient } from "../src/browser/client.mjs";
import { config } from "./fixtures/module.mjs";

const definition = normalizeBoxJs(config, "Module");
const model = { module: "Module", boxjs: config, values: { "Module.Settings.Home.enabled": false, "Module.Settings.Home.mode": "b", "Module.Settings.items": ["a", "b"], "Module.Settings.note": "", "Module.Settings.count": 1 }, configURL: "/configs/Module" };

test("browser client consumes an API model and sends no BoxJS request", async () => {
    const calls = [];
    const client = createPreferencesClient({
        model,
        definition,
        fetch: async (...args) => {
            calls.push(args);
            return new Response(JSON.stringify({}), { status: 200 });
        },
    });
    assert.deepEqual(client.snapshot(), { definition, values: model.values });
    await client.set("Module.Settings.Home.mode", "a");
    assert.equal(calls[0][0], "/api/Module/set");
    assert.deepEqual(JSON.parse(calls[0][1].body), { key: "Module.Settings.Home.mode", value: "a" });
    assert.equal(calls[0][1].headers["X-PreferencePanes-JSON"], "/configs/Module");
});

test("settings and caches are read through module API actions", async () => {
    const calls = [];
    const client = createPreferencesClient({
        model,
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
    const client = createPreferencesClient({ model, definition, notify: event => notifications.push(event), fetch: async () => new Response(JSON.stringify({}), { status: 200 }) });
    await client.set("Module.Settings.Home.mode", "a");
    await client.remove("Module.Settings.items");
    await client.clearCaches();
    await client.reset();
    assert.equal(client.snapshot().values["Module.Settings.Home.mode"], "a");
    assert.deepEqual(
        notifications.map(event => event.operation),
        ["write", "delete", "clearCaches", "reset"],
    );
});

test("API errors notify and preserve the cached model", async () => {
    const notifications = [];
    const client = createPreferencesClient({ model, definition, notify: event => notifications.push(event), fetch: async () => new Response(null, { status: 500 }) });
    const before = client.snapshot();
    await assert.rejects(client.set("Module.Settings.count", 2), /HTTP 500/);
    assert.deepEqual(client.snapshot(), before);
    assert.equal(notifications.at(-1).kind, "error");
});

test("a timed out request does not abort later API actions", async () => {
    let calls = 0;
    const client = createPreferencesClient({
        model,
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
