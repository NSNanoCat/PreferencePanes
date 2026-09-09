import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBoxJs } from "../src/lib/boxjs.mjs";
import { config } from "./fixtures/module.mjs";

test("BoxJS array, app and subscription normalize IDs without project constants", () => {
    const a = normalizeBoxJs(config, "Module");
    assert.equal(a.storageKey, "Example");
    assert.deepEqual(a.settingsPath, ["Module", "Settings"]);
    assert.deepEqual(normalizeBoxJs({ settings: config }, "Module"), a);
    assert.deepEqual(normalizeBoxJs({ apps: [{ settings: config }, { settings: [{ ...config[0], id: "@Other.Second.Settings.on" }] }] }, "Module"), a);
    assert.equal(a.fields[4].defaultValue, 1);
    assert.throws(() => normalizeBoxJs([{ ...config[0], type: "unsupported" }], "Module"), /Unsupported/);
    assert.throws(() => normalizeBoxJs([...config, config[0]], "Module"), /overlapping/);
    assert.throws(() => normalizeBoxJs([...config, { ...config[0], id: "@Other.Module.Settings.x" }], "Module"), /one storage root/);
});

test("BoxJS metadata belongs to the app owning matching field IDs", () => {
    const result = normalizeBoxJs(
        {
            id: "example.sub",
            apps: [
                {
                    id: "unrelated-app-id",
                    name: "Example Module",
                    author: "Example",
                    repo: "https://example.org/repo",
                    icons: ["light", "dark"],
                    settings: config,
                },
            ],
        },
        "Module",
    );
    assert.deepEqual(result.metadata, {
        id: "unrelated-app-id",
        name: "Example Module",
        author: "Example",
        repo: "https://example.org/repo",
        icons: ["light", "dark"],
    });
    assert.equal(result.fields.length, config.length);
});

test("BoxJS input presentation metadata is preserved for the generic renderer", () => {
    const result = normalizeBoxJs([{ ...config[3], type: "textarea", placeholder: "one per line", rows: 5, autoGrow: true }], "Module");
    assert.equal(result.fields[0].placeholder, "one per line");
    assert.equal(result.fields[0].rows, 5);
    assert.equal(result.fields[0].autoGrow, true);
    assert.equal(result.fields[0].control, "textarea");
    assert.equal(result.fields[0].type, "string");
    assert.throws(() => normalizeBoxJs([{ ...config[3], rows: 0 }], "Module"), /Invalid or overlapping/);
    assert.throws(() => normalizeBoxJs([{ ...config[3], autoGrow: "yes" }], "Module"), /Invalid or overlapping/);
    assert.throws(() => normalizeBoxJs([{ ...config[3], placeholder: [] }], "Module"), /Invalid or overlapping/);
});

test("app IDs and names never override field routing, including mixed legacy subscriptions", () => {
    const app = {
        id: "not-the-module",
        name: "Display title",
        desc: "Plain text",
        descs: ["Second line"],
        script: "https://example.org/run.js",
        settings: config,
    };
    const subscription = { apps: [{ id: "Module", name: "Wrong app", settings: [{ id: "legacy-key", type: "boolean", val: true }] }, app] };
    const normalized = normalizeBoxJs(subscription, "Module");
    assert.equal(normalized.metadata.name, "Display title");
    assert.deepEqual(normalized, normalizeBoxJs(app, "Module"));
    assert.equal(normalized.fields[0].key, "Module.Settings.Home.enabled");
    assert.equal(normalized.storageKey, "Example");
    assert.equal(normalized.metadata.script, app.script);
    assert.deepEqual(normalized.metadata.descs, ["Second line"]);
    assert.throws(() => normalizeBoxJs({ ...app, icons: [42] }, "Module"), /Invalid BoxJS app icons/);
    assert.throws(() => normalizeBoxJs({ apps: {} }, "Module"), /Expected BoxJS apps array/);
    const split = normalizeBoxJs(
        {
            apps: [
                { name: "First", settings: config.slice(0, 2) },
                { name: "Second", settings: config.slice(2) },
            ],
        },
        "Module",
    );
    assert.equal(split.metadata, undefined);
    assert.deepEqual(split.fields, normalized.fields);
});

test("raw BoxJS path segments and browser-style encoded input retain their distinct validation", () => {
    for (const key of ["bad/path", "bad%20path", "bad path", "prototype"]) assert.throws(() => normalizeBoxJs([{ ...config[0], id: `@Example.Module.Settings.${key}` }], "Module"));
    const field = normalizeBoxJs([{ ...config[0], id: "@Example.Module.Settings.valid_key-1" }], "Module").fields[0];
    assert.equal(field.key, "Module.Settings.valid_key-1");
});
