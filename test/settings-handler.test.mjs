import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

// 在导入 util 之前安装代理运行时，确保用实际 Storage 适配器。
// Install proxy globals before imports to exercise the actual util Storage adapter.
const store = new Map();
let reads = 0;
let writes = 0;
let writable = true;
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
const { createSettingsHandler } = await import("../index.mjs");
const fields = [
  { key: "feature.enabled", name: "Enabled", type: "boolean", defaultValue: true },
  {
    key: "mode",
    name: "Mode",
    type: "string",
    defaultValue: "a",
    options: [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ],
  },
  {
    key: "items",
    name: "Items",
    type: "array",
    defaultValue: ["a"],
    options: [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
    ],
  },
  { key: "count", name: "Count", type: "number", defaultValue: 1 },
];
const options = {
  module: "Example",
  fields,
  storageKey: "@ExampleOrg.Example.Settings",
  endpoint: "https://example.org/settings/api/Example",
};
const request = (method = "GET", values, headers = {}) => ({
  url: options.endpoint,
  method,
  headers: { "X-Settings-Client": "1", "Content-Type": "application/json", ...headers },
  ...(values === undefined ? {} : { body: JSON.stringify({ values }) }),
});
beforeEach(() => {
  store.clear();
  reads = 0;
  writes = 0;
  writable = true;
});

test("HEAD is bodyless and accesses neither settings nor storage", () => {
  const handler = createSettingsHandler({
    ...options,
    resolveSettings() {
      throw new Error("must not run");
    },
  });
  assert.equal(handler(request("HEAD")).status, 200);
  assert.equal(handler(request("HEAD")).body, "");
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("defaults, dotted values, false, zero and empty arrays survive read/write", () => {
  const handler = createSettingsHandler(options);
  assert.deepEqual(JSON.parse(handler(request()).body).values, { "feature.enabled": true, mode: "a", items: ["a"], count: 1 });
  const values = { "feature.enabled": false, count: 0, items: [] };
  assert.equal(handler(request("POST", values)).status, 200);
  assert.equal(writes, 1);
  assert.deepEqual(JSON.parse(handler(request()).body).values, { ...values, mode: "a" });
  const persisted = JSON.parse(store.get("ExampleOrg"));
  assert.equal(typeof persisted.Example.Settings, "string", "util owns nested-path serialization");
  assert.deepEqual(JSON.parse(persisted.Example.Settings), { feature: { enabled: false }, count: 0, items: [] });
});

test("partial writes preserve hidden fields, caches and other organizations", () => {
  store.set(
    "ExampleOrg",
    JSON.stringify({
      Example: { Settings: JSON.stringify({ hidden: 42, feature: { untouched: true } }), Caches: { token: "sentinel" } },
      Other: { Settings: { mode: "x" } },
    }),
  );
  store.set("AnotherOrg", '{"untouched":true}');
  createSettingsHandler(options)(request("POST", { "feature.enabled": false }));
  const persisted = JSON.parse(store.get("ExampleOrg"));
  assert.deepEqual(JSON.parse(persisted.Example.Settings), { hidden: 42, feature: { untouched: true, enabled: false } });
  assert.deepEqual(persisted.Example.Caches, { token: "sentinel" });
  assert.deepEqual(persisted.Other, { Settings: { mode: "x" } });
  assert.equal(store.get("AnotherOrg"), '{"untouched":true}');
});

test("effective settings resolver runs on each GET and owns precedence", () => {
  let argumentMode = "b";
  const handler = createSettingsHandler({ ...options, resolveSettings: (stored) => ({ ...stored, mode: argumentMode }) });
  assert.equal(handler(request("POST", { mode: "a" })).status, 200);
  assert.equal(JSON.parse(handler(request()).body).values.mode, "b");
  argumentMode = "a";
  assert.equal(JSON.parse(handler(request()).body).values.mode, "a");
});

test("whole patch validation rejects invalid values before any write", () => {
  const handler = createSettingsHandler(options);
  for (const values of [
    { unknown: true },
    { "feature.enabled": "true" },
    { mode: "unknown" },
    { count: "2" },
    { count: null },
    { items: ["a", "a"] },
    { items: [{}] },
    { items: ["other"] },
    { mode: "a", count: false },
    {},
    [],
    null,
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ]) {
    assert.equal(handler(request("POST", values)).status, 400, JSON.stringify(values));
  }
  assert.equal(writes, 0);
  assert.equal(store.size, 0);
  assert.equal({}.polluted, undefined);
});

test("routing is exact and does not claim static files or another domain/module", () => {
  const handler = createSettingsHandler(options);
  for (const url of [
    "https://example.org/settings/",
    `${options.endpoint}/extra`,
    "https://other.org/settings/api/Example",
    "https://example.org/settings/api/Other",
  ])
    assert.equal(handler({ ...request(), url }), undefined);
  assert.equal(handler({ ...request(), url: `${options.endpoint}?v=2` }).status, 200);
  const other = createSettingsHandler({ ...options, module: "Second", storageKey: "OtherKey", endpoint: "https://other.org/config" });
  assert.equal(other({ ...request(), url: "https://other.org/config" }).status, 200);
});

test("header/origin boundary and method/content-type/body errors are explicit", () => {
  const handler = createSettingsHandler(options);
  assert.equal(handler({ ...request(), headers: {} }).status, 403);
  assert.equal(handler(request("POST", { count: 2 }, { Origin: "https://other.org" })).status, 403);
  assert.equal(handler({ ...request("HEAD"), headers: {} }).body, "");
  assert.equal(handler(request("OPTIONS")).status, 405);
  assert.equal(handler(request("DELETE")).headers.Allow, "HEAD, GET, POST");
  assert.equal(handler(request("POST", { count: 2 }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal(handler({ ...request("POST"), body: "{" }).status, 400);
  assert.equal(handler({ ...request("POST"), body: "x".repeat(65537) }).status, 413);
  assert.equal(handler(request("POST")).status, 400);
  assert.equal(handler(request("POST", { count: 2 }, { "Content-Type": "application/json; charset=utf-8" })).status, 200);
});

test("failed writes report failure; resolver and backend errors are not swallowed", () => {
  writable = false;
  assert.equal(createSettingsHandler(options)(request("POST", { count: 2 })).status, 500);
  assert.equal(store.size, 0);
  assert.throws(
    () =>
      createSettingsHandler({
        ...options,
        resolveSettings() {
          throw new Error("resolver failure");
        },
      })(request()),
    /resolver failure/,
  );
  store.set("ExampleOrg", JSON.stringify({ Example: { Settings: "invalid stored content" } }));
  assert.throws(() => createSettingsHandler(options)(request()), /resolved settings/);
});

test("factory rejects ambiguous or unsafe schemas and snapshots field definitions", () => {
  for (const key of ["__proto__.x", "constructor.prototype", "x..y", "x[0]"])
    assert.throws(() => createSettingsHandler({ ...options, fields: [{ key, name: key, type: "string" }] }), TypeError);
  assert.throws(() => createSettingsHandler({ ...options, fields: [fields[0], fields[0]] }), /Overlapping/);
  assert.throws(() => createSettingsHandler({ ...options, fields: [fields[0], { key: "feature", type: "string" }] }), /Overlapping/);
  assert.throws(() => createSettingsHandler({ ...options, fields: [{ ...fields[1], defaultValue: "invalid" }] }), /Invalid defaultValue/);
  assert.throws(() => createSettingsHandler({ ...options, endpoint: "http://example.org/" }), /HTTPS/);
  const mutable = structuredClone(fields);
  const handler = createSettingsHandler({ ...options, fields: mutable });
  mutable[1].options.push({ key: "bad", label: "Bad" });
  assert.equal(handler(request("POST", { mode: "bad" })).status, 400);
});
