import assert from "node:assert/strict";
import test from "node:test";
import { BoxJS } from "../src/BoxJS.mjs";

test("BoxJS indexes module identities and their storage roots", () => {
    const input = {
        name: "Example",
        apps: [
            { id: "unrelated-id", name: "First", icon: "https://example.org/icon.png", settings: [{ id: "@One.Alpha.Settings.on", type: "boolean", val: true }] },
            { name: "Second", settings: [{ id: "@Two.Beta.Settings.mode", type: "text", val: "default" }] },
        ],
    };
    const catalog = new BoxJS(input);
    assert.deepEqual(
        [...catalog.modules].map(([module, value]) => [module, value.storageKey, value.metadata.name]),
        [
            ["Alpha", "One", "First"],
            ["Beta", "Two", "Second"],
        ],
    );
    assert.equal(catalog.metadata.name, "Example");
    input.apps[0].settings[0].id = "@Other.Alpha.Settings.on";
    assert.equal(catalog.modules.get("Alpha").storageKey, "One");
});

test("catalog rejects external mappings and ambiguous module roots", () => {
    for (const input of [undefined, "https://example.org/config.json", { origin: "https://example.org", storageKey: "Root", module: "Module" }, { apps: [{ module: "Module", name: "Old menu" }] }]) assert.throws(() => new BoxJS(input));
    assert.throws(() => new BoxJS([{ id: "@One.Module.Settings.a" }, { id: "@Two.Module.Settings.b" }]), /one storage root/);
    assert.equal(new BoxJS([]).modules.size, 0);
    assert.throws(() => new BoxJS([{ id: "@@One.Module.Settings.a" }]), /literal storage root/);
});
