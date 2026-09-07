import assert from "node:assert/strict";
import test from "node:test";

const data = new Map();
globalThis.$task = {};
globalThis.$prefs = {
  valueForKey: (key) => data.get(key) ?? null,
  setValueForKey: (value, key) => {
    data.set(key, value);
    return true;
  },
};
const { createSettingsHandler } = await import("../index.mjs");
test("the same path handler uses util prefs for Quantumult X", () => {
  const handler = createSettingsHandler({
    origin: "https://example.org",
    storageKey: "QX",
    fields: [{ key: "prefs.enabled", name: "Enabled", type: "boolean" }],
  });
  const request = {
    url: "https://example.org/api/prefs/enabled",
    method: "POST",
    body: "true",
    headers: { "X-Settings-Client": "1", "Content-Type": "application/json" },
  };
  assert.equal(handler(request).status, 204);
  assert.equal(handler({ ...request, method: "GET" }).body, "true");
  assert.equal(handler({ ...request, method: "DELETE" }).status, 204);
  assert.equal(handler({ ...request, method: "GET" }).status, 404);
});
