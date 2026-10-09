import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { normalizeBoxJs } from "../src/browser/boxjs.mjs";
import { PreferencesClient } from "../src/browser/client.mjs";
import { config } from "./fixtures/module.mjs";

const definition = normalizeBoxJs(config, "Module");
const settings = { Home: { enabled: false, mode: "b" }, items: ["a", "b"], note: "", count: "2" };

test("browser persistence works without APIs unavailable in iOS 15.0", () => {
    const result = spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "-e",
            `import assert from "node:assert/strict";
import { normalizeBoxJs } from "./src/browser/boxjs.mjs";
import { PreferencesClient } from "./src/browser/client.mjs";
Object.hasOwn = undefined;
globalThis.structuredClone = undefined;
const definition = normalizeBoxJs([
    { id: "@Root.Module.Settings.Languages[0]", name: "Source", type: "text", val: "AUTO" },
    { id: "@Root.Module.Settings.Languages[1]", name: "Target", type: "text", val: "ZH" },
]);
const writes = [];
const client = new PreferencesClient({ definition, fetch: async (_url, options) => {
    if (_url.endsWith("/get")) return new Response(null, { status: 404 });
    writes.push([...new URLSearchParams(options.body)][0]);
    return new Response("{}", { status: 200 });
} });
await client.open();
await client.set("Module.Settings.Languages.1", "JA");
await client.remove("Module.Settings.Languages.1");
assert.deepEqual(writes, [["@Root.Module.Settings.Languages", '["AUTO","JA"]'], ["@Root.Module.Settings.Languages", '["AUTO","ZH"]']]);
await client.reset();
assert.equal(client.snapshot().values["Module.Settings.Languages.1"], "ZH");`,
        ],
        { cwd: new URL("..", import.meta.url), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
});

test("indexed languages round-trip through the real API; shared cache and module resets stay scoped", async () => {
    const definition = normalizeBoxJs({
        cachePath: "@DualSubs.Composite.Caches",
        settings: [
            {
                id: "@DualSubs.Universal.Settings.Languages[0]",
                name: "源语言",
                type: "selects",
                val: "AUTO",
                items: [
                    { key: "AUTO", label: "自动" },
                    { key: "EN", label: "英语" },
                ],
            },
            {
                id: "@DualSubs.Universal.Settings.Languages[1]",
                name: "目标语言",
                type: "selects",
                val: "ZH",
                items: [
                    { key: "ZH", label: "中文" },
                    { key: "JA", label: "日语" },
                ],
            },
        ],
    });
    const source = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");
    const storage = new Map([["DualSubs", JSON.stringify({ Composite: { Caches: { playlist: [1] }, Settings: { untouched: true } }, Other: { keep: true } })]]);
    const fetch = (path, options) =>
        new Promise(resolve => {
            vm.runInNewContext(source, {
                $environment: { "surge-version": "test" },
                $persistentStore: {
                    read: key => storage.get(key),
                    write: (value, key) => {
                        storage.set(key, value);
                        return true;
                    },
                },
                $request: { url: `https://example.test${path}`, ...options },
                $script: { startTime: Date.now() / 1000 },
                $done: ({ response }) => resolve(new Response(response.body, { status: response.status, headers: response.headers })),
                console: { log() {}, error() {} },
            });
        });
    const client = new PreferencesClient({ definition, fetch });
    await client.open();
    await client.set("Universal.Settings.Languages.0", "EN");
    assert.deepEqual(JSON.parse(storage.get("DualSubs")).Universal.Settings.Languages, ["EN", "ZH"]);
    await client.set("Universal.Settings.Languages.1", "JA");
    assert.deepEqual(JSON.parse(storage.get("DualSubs")).Universal.Settings.Languages, ["EN", "JA"]);
    const refreshed = new PreferencesClient({ definition, fetch });
    assert.equal((await refreshed.open()).values["Universal.Settings.Languages.1"], "JA");
    await refreshed.remove("Universal.Settings.Languages.0");
    assert.deepEqual(JSON.parse(storage.get("DualSubs")).Universal.Settings.Languages, ["AUTO", "JA"]);
    assert.deepEqual(await refreshed.readCaches(), { playlist: [1] });
    await refreshed.reset();
    assert.deepEqual(JSON.parse(storage.get("DualSubs")), { Composite: { Caches: { playlist: [1] }, Settings: { untouched: true } }, Other: { keep: true } });
    await refreshed.set("Universal.Settings.Languages.1", "JA");
    assert.deepEqual(JSON.parse(storage.get("DualSubs")).Universal.Settings.Languages, ["AUTO", "JA"]);
    await refreshed.clearCaches();
    assert.deepEqual(JSON.parse(storage.get("DualSubs")), { Composite: { Settings: { untouched: true } }, Other: { keep: true }, Universal: { Settings: { Languages: ["AUTO", "JA"] } } });
    const root = JSON.parse(storage.get("DualSubs"));
    root.API = { Settings: { GoogleCloud: { Auth: "key" }, Microsoft: { Auth: "token" }, NeteaseMusic: { Password: "password" }, URL: "https://example.test/subtitles.vtt" }, Caches: { keep: true } };
    storage.set("DualSubs", JSON.stringify(root));
    const api = new PreferencesClient({
        definition: normalizeBoxJs({
            settings: [
                { id: "@DualSubs.API.Settings.GoogleCloud.Auth", name: "Key", type: "text", val: "" },
                { id: "@DualSubs.API.Settings.Microsoft.Auth", name: "Token", type: "text", val: "" },
            ],
            resetPaths: ["@DualSubs.API.Settings.GoogleCloud", "@DualSubs.API.Settings.Microsoft"],
        }),
        fetch,
    });
    await api.open();
    await api.reset();
    assert.deepEqual(JSON.parse(storage.get("DualSubs")).API, { Settings: { NeteaseMusic: { Password: "password" }, URL: "https://example.test/subtitles.vtt" }, Caches: { keep: true } });
    assert.equal(api.snapshot().values["API.Settings.GoogleCloud.Auth"], "");
});

test("indexed writes preserve existing siblings and undisplayed entries; failures leave the snapshot unchanged", async () => {
    const definition = normalizeBoxJs([
        { id: "@Root.Module.Settings.Languages[0]", name: "源", type: "text", val: "AUTO" },
        { id: "@Root.Module.Settings.Languages[1]", name: "目标", type: "text", val: "ZH" },
    ]);
    const calls = [];
    let fail = false;
    const client = new PreferencesClient({
        definition,
        fetch: async (_url, options) => {
            calls.push(options);
            return new Response(calls.length === 1 ? JSON.stringify({ Languages: ["EN", true, "extra"] }) : "{}", { status: fail ? 500 : 200 });
        },
    });
    await client.open();
    await client.set("Module.Settings.Languages.0", "FR");
    assert.deepEqual([...new URLSearchParams(calls[1].body)], [["@Root.Module.Settings.Languages", '["FR",true,"extra"]']]);
    const before = client.snapshot();
    fail = true;
    await assert.rejects(client.remove("Module.Settings.Languages.1"), /HTTP 500/);
    assert.deepEqual(client.snapshot(), before);
});

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
        warnings: {},
    });
    await client.set("Module.Settings.Home.mode", "a");
    assert.deepEqual(
        calls.map(call => {
            const [entry] = new URLSearchParams(call.body);
            return [call.method, call.url, ...entry];
        }),
        [
            ["POST", "/api/get", "@Example.Module.Settings", ""],
            ["POST", "/api/set", "@Example.Module.Settings.Home.mode", '"a"'],
        ],
    );
    assert.deepEqual(calls[0].headers, { "Content-Type": "application/x-www-form-urlencoded" });
    assert.equal(client.snapshot().values["Module.Settings.Home.mode"], "a");
});

test("missing Settings initializes the page from BoxJS defaults", async () => {
    const client = new PreferencesClient({ definition, fetch: async () => new Response(null, { status: 404 }) });
    const snapshot = await client.open();
    assert.deepEqual(snapshot.values, {
        "Module.Settings.Home.enabled": true,
        "Module.Settings.Home.mode": "a",
        "Module.Settings.items": ["a"],
        "Module.Settings.note": "",
        "Module.Settings.count": 1,
    });
    assert.deepEqual(snapshot.warnings, {});
});

test("read-only URL fields ignore legacy stored values at the same path", async () => {
    const definition = normalizeBoxJs([{ id: "@BiliBili.Enhanced.Settings.Home.Tab", name: "打开分区", type: "url", val: "bilibili://main/top_category" }], "Enhanced");
    const client = new PreferencesClient({
        definition,
        fetch: async () => new Response(JSON.stringify({ Tab: ["2036", "2037"] }), { status: 200 }),
    });
    const snapshot = await client.open();
    assert.deepEqual(snapshot.values, {
        "Enhanced.Settings.Home.Tab": "bilibili://main/top_category",
    });
    assert.deepEqual(snapshot.warnings, {});
});

test("stored options absent from the current definition remain visible as field warnings", async () => {
    const client = new PreferencesClient({
        definition,
        fetch: async () => new Response(JSON.stringify({ ...settings, Home: { ...settings.Home, mode: "legacy" }, items: ["a", "legacy"] }), { status: 200 }),
    });
    const snapshot = await client.open();
    assert.equal(snapshot.values["Module.Settings.Home.mode"], "legacy");
    assert.deepEqual(snapshot.values["Module.Settings.items"], ["a", "legacy"]);
    assert.deepEqual(snapshot.warnings, {
        "Module.Settings.Home.mode": { kind: "undefined-options", values: ["legacy"] },
        "Module.Settings.items": { kind: "undefined-options", values: ["legacy"] },
    });
    await client.set("Module.Settings.Home.mode", "a");
    assert.equal(client.snapshot().warnings["Module.Settings.Home.mode"], undefined);
    assert.deepEqual(client.snapshot().warnings["Module.Settings.items"], { kind: "undefined-options", values: ["legacy"] });
});

test("settings and caches are read through fixed form actions", async () => {
    const calls = [];
    const client = new PreferencesClient({
        definition,
        fetch: async (url, options) => {
            calls.push({ url, ...options });
            const [key] = new URLSearchParams(options.body).keys();
            return key.endsWith(".Caches") ? new Response(JSON.stringify({ items: [1, 2] }), { status: 200 }) : new Response(JSON.stringify({ count: 7 }), { status: 200 });
        },
    });
    assert.deepEqual(await client.readSettings(), { count: 7 });
    assert.deepEqual(await client.readCaches(), { items: [1, 2] });
    assert.deepEqual(
        calls.map(call => [call.method, call.url, [...new URLSearchParams(call.body).keys()][0]]),
        [
            ["POST", "/api/get", "@Example.Module.Settings"],
            ["POST", "/api/get", "@Example.Module.Caches"],
        ],
    );
});

test("invalid fields and values are rejected before a storage request", async () => {
    const calls = [];
    const client = new PreferencesClient({
        definition,
        fetch: async (url, options) => {
            calls.push({ url, ...options });
            return new Response(null, { status: 200 });
        },
    });
    await assert.rejects(client.set("Module.Settings.Unknown", true), /Invalid setting value/);
    await assert.rejects(client.set("Module.Settings.count", Number.NaN), /Invalid setting value/);
    await assert.rejects(client.set("Module.Settings.Home.mode", "legacy"), /Invalid setting value/);
    await assert.rejects(client.set("Module.Settings.items", ["a", "legacy"]), /Invalid setting value/);
    await assert.rejects(client.remove("Module.Settings.Unknown"), /Invalid setting value/);
    assert.equal(calls.length, 0);
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

test("stored values with unsupported shapes use defaults and report field warnings", async () => {
    let calls = 0;
    const client = new PreferencesClient({
        definition,
        fetch: async () => new Response(JSON.stringify(++calls === 1 ? { ...settings, count: "not-a-number" } : settings), { status: 200 }),
    });
    const invalid = await client.open();
    assert.equal(invalid.values["Module.Settings.count"], 1);
    assert.deepEqual(invalid.warnings, {
        "Module.Settings.count": { kind: "invalid-value", values: ["not-a-number"] },
    });
    const valid = await client.open();
    assert.equal(valid.values["Module.Settings.count"], 2);
    assert.deepEqual(valid.warnings, {});
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
