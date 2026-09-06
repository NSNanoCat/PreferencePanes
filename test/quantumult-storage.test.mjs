import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
globalThis.$task = {};
globalThis.$prefs = {
  valueForKey: (key) => values.get(key) ?? null,
  setValueForKey: (value, key) => {
    values.set(key, value);
    return true;
  },
};
const { createSettingsHandler } = await import("../index.mjs");
test("Quantumult storage uses util prefs backend with the same handler", () => {
  const handle = createSettingsHandler({
    module: "QX",
    fields: [{ key: "enabled", name: "Enabled", type: "boolean" }],
    storageKey: "@Example.QX.Settings",
    endpoint: "https://example.org/api",
    requestHeader: "X-Example-Settings",
  });
  const req = {
    url: "https://example.org/api",
    method: "POST",
    headers: { "x-example-settings": "1", "content-type": "application/json" },
    body: '{"values":{"enabled":true}}',
  };
  assert.equal(handle(req).status, 200);
  assert.equal(JSON.parse(handle({ ...req, method: "GET" }).body).values.enabled, true);
  assert.ok(values.has("Example"));
});
