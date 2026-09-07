import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

const store = new Map();
let reads = 0,
  writes = 0,
  writable = true;
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
const { createSettingsHandler, parseSettingsPath } = await import("../index.mjs");
const fields = [
  {
    key: "Enhanced.Settings.Home.Top_left",
    name: "顶栏左侧",
    type: "string",
    defaultValue: "mine",
    options: [
      { key: "mine", label: "我的" },
      { key: "videoshortcut", label: "短视频" },
    ],
  },
  { key: "Enhanced.Settings.Home.Switch", name: "启用", type: "boolean", defaultValue: true },
  { key: "Enhanced.Settings.Home.Top", name: "顶栏", type: "array", defaultValue: ["messages"] },
  { key: "Other.preferences.count", name: "Count", type: "number" },
];
const options = { fields, storageKey: "BiliBili", origin: "https://example.org" };
const request = (method = "GET", key = fields[0].key, value) => ({
  url: `https://example.org/api/${key.replaceAll(".", "/")}`,
  method,
  headers: { "X-Settings-Client": "1", "Content-Type": "application/json" },
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});
beforeEach(() => {
  store.clear();
  reads = 0;
  writes = 0;
  writable = true;
});

test("common path parser fixes only api and rejects unsafe/ambiguous segments", () => {
  assert.deepEqual(parseSettingsPath(request().url), ["Enhanced", "Settings", "Home", "Top_left"]);
  assert.deepEqual(parseSettingsPath("https://example.org/api/Other/preferences/count?q=1"), ["Other", "preferences", "count"]);
  assert.equal(parseSettingsPath("https://example.org/settings/api/Example"), undefined);
  for (const suffix of ["", "A//B", "A/", "__proto__/x", "constructor/prototype", "A%2FB", "A%2eB", "%ZZ"])
    assert.throws(() => parseSettingsPath(`https://example.org/api/${suffix}`), TypeError);
});

test("POST literal mine writes the exact database path and GET returns the JSON scalar", () => {
  const handle = createSettingsHandler(options);
  assert.equal(handle(request("POST", fields[0].key, "mine")).status, 204);
  assert.deepEqual(JSON.parse(store.get("BiliBili")), { Enhanced: { Settings: { Home: { Top_left: "mine" } } } });
  assert.equal(handle(request()).body, '"mine"');
  assert.equal(writes, 1);
});

test("false, zero and empty arrays are stored as values, not missing defaults", () => {
  const handle = createSettingsHandler(options);
  for (const [key, value] of [
    [fields[1].key, false],
    [fields[2].key, []],
    [fields[3].key, 0],
  ]) {
    assert.equal(handle(request("POST", key, value)).status, 204);
    assert.deepEqual(JSON.parse(handle(request("GET", key)).body), value);
  }
});

test("DELETE uses the URL only, preserves siblings and is idempotent", () => {
  store.set(
    "BiliBili",
    JSON.stringify({
      Enhanced: { Settings: { Home: { Top_left: "videoshortcut", hidden: 7 } }, Caches: { marker: 1 } },
      Other: { preferences: { count: 5 } },
    }),
  );
  const handle = createSettingsHandler(options);
  const deletion = request("DELETE");
  delete deletion.headers["Content-Type"];
  assert.equal(handle(deletion).status, 204);
  assert.equal(handle(deletion).body, "");
  assert.deepEqual(JSON.parse(store.get("BiliBili")), {
    Enhanced: { Settings: { Home: { hidden: 7 } }, Caches: { marker: 1 } },
    Other: { preferences: { count: 5 } },
  });
  assert.equal(handle(request()).body, '"mine"', "default reappears after removing override");
  store.clear();
  assert.equal(handle(deletion).status, 204);
});

test("reads and updates util-serialized intermediate Settings without losing hidden fields", () => {
  store.set("BiliBili", JSON.stringify({ Enhanced: { Settings: JSON.stringify({ Home: { Top_left: "videoshortcut", hidden: 8 } }) } }));
  const handle = createSettingsHandler(options);
  assert.equal(handle(request()).body, '"videoshortcut"');
  assert.equal(handle(request("POST", fields[0].key, "mine")).status, 204);
  assert.equal(JSON.parse(store.get("BiliBili")).Enhanced.Settings.Home.hidden, 8);
});

test("HEAD checks declared path without accessing persistent settings or resolver", () => {
  const handle = createSettingsHandler({
    ...options,
    resolveSettings() {
      throw Error("unexpected");
    },
  });
  assert.equal(handle(request("HEAD")).status, 200);
  assert.equal(handle(request("HEAD", "Unknown.path")).status, 404);
  assert.equal(handle(request("HEAD", "Unknown.path")).body, "");
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("unknown paths, type mismatch, old values envelopes and malformed input never write", () => {
  const handle = createSettingsHandler(options);
  assert.equal(handle(request("POST", "Unknown.path", 1)).status, 404);
  for (const value of [null, false, 1, "unknown", { values: { Top_left: "mine" } }])
    assert.equal(handle(request("POST", fields[0].key, value)).status, 400);
  assert.equal(handle({ ...request("POST"), body: "mine" }).status, 400);
  assert.equal(handle(request("POST")).status, 400);
  assert.equal(handle({ ...request("POST"), body: "x".repeat(65537) }).status, 413);
  assert.equal(handle({ ...request("POST"), url: "https://example.org/api/__proto__/polluted", body: "true" }).status, 400);
  assert.equal(writes, 0);
  assert.equal({}.polluted, undefined);
});

test("origin, marker and unsupported methods are enforced; non API URLs pass through", () => {
  const handle = createSettingsHandler(options);
  assert.equal(handle({ ...request(), url: "https://other.org/api/Enhanced/Settings/Home/Top_left" }), undefined);
  assert.equal(handle({ ...request(), url: "https://example.org/settings/api/Enhanced" }), undefined);
  assert.equal(handle({ ...request(), headers: {} }).status, 403);
  assert.equal(handle({ ...request(), headers: { ...request().headers, Origin: "https://other.org" } }).status, 403);
  assert.equal(handle(request("OPTIONS")).headers.Allow, "HEAD, GET, POST, DELETE");
  assert.equal(
    handle({ ...request("POST", fields[0].key, "mine"), headers: { ...request().headers, "Content-Type": "text/plain" } }).status,
    415,
  );
});

test("resolver supplies a full database, is GET-only and is recomputed", () => {
  let count = 2;
  const handle = createSettingsHandler({ ...options, resolveSettings: () => ({ Other: { preferences: { count } } }) });
  assert.equal(handle(request("GET", fields[3].key)).body, "2");
  count = 3;
  assert.equal(handle(request("GET", fields[3].key)).body, "3");
  const noResolve = createSettingsHandler({
    ...options,
    resolveSettings() {
      throw Error("resolver failure");
    },
  });
  assert.equal(noResolve(request("DELETE")).status, 204);
  assert.throws(() => noResolve(request()), /resolver failure/);
});

test("missing values and backend failures remain explicit", () => {
  const handle = createSettingsHandler(options);
  assert.equal(handle(request("GET", fields[3].key)).status, 404);
  writable = false;
  assert.equal(handle(request("POST", fields[0].key, "mine")).status, 500);
  assert.equal(handle(request("DELETE")).status, 500);
  store.set("BiliBili", JSON.stringify({ Enhanced: { Settings: "broken" } }));
  assert.throws(() => handle(request()), SyntaxError);
});

test("schema rejects overlapping or dangerous keys; arbitrary org/root shapes work", () => {
  assert.throws(() => createSettingsHandler({ ...options, fields: [fields[0], fields[0]] }), /Overlapping/);
  for (const key of ["__proto__.x", "A..B", "A/B", "A.constructor"])
    assert.throws(() => createSettingsHandler({ ...options, fields: [{ key, name: key, type: "string" }] }), TypeError);
  assert.throws(() => createSettingsHandler({ ...options, origin: "https://example.org/api" }), /origin/);
  const handle = createSettingsHandler({
    origin: "https://other.org",
    storageKey: "DifferentRoot",
    fields: [{ key: "preferences.volume", name: "Volume", type: "number" }],
  });
  assert.equal(handle({ ...request("POST", "preferences.volume", 5), url: "https://other.org/api/preferences/volume" }).status, 204);
  assert.deepEqual(JSON.parse(store.get("DifferentRoot")), { preferences: { volume: 5 } });
});
