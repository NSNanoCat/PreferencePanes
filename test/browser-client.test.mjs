import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBoxJs } from "../src/lib/boxjs.mjs";
import { createPreferencesClient } from "../src/browser/client.mjs";
import { config } from "./fixtures/module.mjs";

const definition = normalizeBoxJs(config, "Module");
const model = { module: "Module", definition, values: { "Module.Settings.Home.enabled": false, "Module.Settings.Home.mode": "b", "Module.Settings.items": ["a", "b"], "Module.Settings.note": "", "Module.Settings.count": 1 }, configURL: "/configs/Module" };

test("opening consumes the API model and never imports BoxJS in the browser client", async () => {
    const { client, calls } = fixture();
    const result = await client.open("Module");
    assert.deepEqual(result, { definition, values: model.values });
    assert.deepEqual(calls.map(call => [call.method, call.url]), [["GET", "/api/module/Module"]]);
    assert.equal(calls[0].headers["X-PreferencePanes-JSON"], "/configs/Module");
});

test("opening can render the model already fetched by app.mjs without a second request", async () => {
    const { client, calls } = fixture();
    await client.open("Module", model);
    assert.equal(calls.length, 0);
    assert.equal(client.snapshot("Module").values["Module.Settings.count"], 1);
});

test("settings and caches are read through module API actions", async () => {
    const { client, state, calls } = fixture();
    await client.open("Module");
    state.settings = { count: 7 };
    state.caches = { items: [1, 2] };
    assert.deepEqual(await client.readSettings("Module"), state.settings);
    assert.deepEqual(await client.readCaches("Module"), state.caches);
    assert.deepEqual(calls.slice(1).map(call => [call.method, call.url, JSON.parse(call.body)]), [
        ["POST", "/api/module/Module/get", { scope: "settings" }],
        ["POST", "/api/module/Module/get", { scope: "caches" }],
    ]);
});

test("successful mutations update the page cache without rereading", async () => {
    const { client, calls, notifications } = fixture();
    await client.open("Module");
    await client.set("Module", "Module.Settings.Home.mode", "a");
    await client.remove("Module", "Module.Settings.items");
    await client.clearCaches("Module");
    await client.reset("Module");
    assert.equal(client.snapshot("Module").values["Module.Settings.Home.mode"], "a");
    assert.deepEqual(calls.slice(1).map(call => [call.method, call.url, JSON.parse(call.body)]), [
        ["POST", "/api/module/Module/set", { key: "Module.Settings.Home.mode", value: "a" }],
        ["POST", "/api/module/Module/delete", { key: "Module.Settings.items" }],
        ["POST", "/api/module/Module/delete", { scope: "caches" }],
        ["POST", "/api/module/Module/delete", { scope: "module" }],
    ]);
    assert.deepEqual(notifications.map(event => event.operation), ["write", "delete", "clearCaches", "reset"]);
});

test("API errors notify and preserve the cached model", async () => {
    const { client, state, notifications } = fixture();
    await client.open("Module");
    const before = client.snapshot("Module");
    state.status = 500;
    await assert.rejects(client.set("Module", "Module.Settings.count", 2), /HTTP 500/);
    assert.deepEqual(client.snapshot("Module"), before);
    assert.equal(notifications.at(-1).kind, "error");
});

test("reopening refreshes the model and cancels a replaced read", async () => {
    const pending = [];
    const client = createPreferencesClient({ configURL: "/configs/Module", fetch: (url, options) => new Promise(resolve => pending.push({ url, options, resolve })) });
    const first = client.open("Module");
    const second = client.open("Module");
    assert.equal(pending[0].options.signal.aborted, true);
    pending[1].resolve(Response.json(model));
    await second;
    pending[0].resolve(Response.json({ ...model, values: { ...model.values, "Module.Settings.count": 3 } }));
    await assert.rejects(first, /replaced/);
    assert.equal(client.snapshot("Module").values["Module.Settings.count"], 1);
});

function fixture() {
    const calls = [];
    const notifications = [];
    const state = { status: 200, settings: { Home: { enabled: false, mode: "b" }, count: 1 }, caches: undefined };
    const client = createPreferencesClient({
        configURL: "/configs/Module",
        notify: event => notifications.push(event),
        fetch: async (url, options) => {
            calls.push({ url, ...options });
            if (state.error) throw state.error;
            const body = options.method === "GET" ? JSON.stringify(model) : JSON.stringify(options.body ? JSON.parse(options.body).scope === "settings" ? state.settings : JSON.parse(options.body).scope === "caches" ? state.caches : {} : {});
            if (options.method === "POST" && state.status !== 200) return new Response(null, { status: state.status });
            if (url.endsWith("/get") && JSON.parse(options.body).scope === "caches" && state.caches === undefined) return new Response(null, { status: 404 });
            return new Response(body, { status: 200 });
        },
    });
    return { client, calls, notifications, state };
}
