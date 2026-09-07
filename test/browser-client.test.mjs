import assert from "node:assert/strict";
import test from "node:test";
import { createPreferencesClient } from "../browser/client.mjs";
import { config } from "./fixtures/module.mjs";

function fixture() {
  const calls = [],
    notifications = [];
  const state = { config, stored: { Home: { enabled: "false", mode: "b" }, items: "a,b" }, status: 200 };
  const client = createPreferencesClient({
    notify: (event) => notifications.push(event),
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      if (state.error) throw state.error;
      const body =
        options.method === "HEAD" || state.status === 204 ? null : JSON.stringify(url === "/api/Module/" ? state.config : state.stored);
      return new Response(body, { status: state.status });
    },
  });
  return { client, calls, notifications, state };
}

test("menu probes only HEAD; opening loads config and subtree exactly once", async () => {
  const { client, calls } = fixture();
  await Promise.all([client.probe("Module"), client.probe("Other")]);
  assert.deepEqual(
    calls.map((call) => [call.method, call.url]),
    [
      ["HEAD", "/api/Module/"],
      ["HEAD", "/api/Other/"],
    ],
  );
  const { values } = await client.open("Module");
  assert.equal(values["Module.Settings.Home.enabled"], false);
  assert.deepEqual(values["Module.Settings.items"], ["a", "b"]);
  assert.equal(values["Module.Settings.count"], 1);
  client.snapshot("Module");
  assert.deepEqual(
    calls.slice(2).map((call) => [call.method, call.url]),
    [
      ["GET", "/api/Module/"],
      ["GET", "/api/Module/Settings/"],
    ],
  );
  assert.ok(calls.every((call) => call.cache === "no-store"));
  assert.deepEqual(calls[2].headers, {});
  assert.equal(calls[3].headers["X-Settings-Client"], "1");
});

test("HTTP 200 writes and deletes update isolated cache without GET", async () => {
  const { client, calls, notifications } = fixture();
  await client.open("Module");
  const snapshot = client.snapshot("Module");
  snapshot.values["Module.Settings.items"].push("x");
  snapshot.definition.fields.length = 0;
  assert.equal(client.snapshot("Module").definition.fields.length, 5);
  assert.deepEqual(client.snapshot("Module").values["Module.Settings.items"], ["a", "b"]);
  await client.set("Module", "Module.Settings.Home.mode", "a");
  await client.remove("Module", "Module.Settings.items");
  assert.equal(client.snapshot("Module").values["Module.Settings.Home.mode"], "a");
  assert.deepEqual(client.snapshot("Module").values["Module.Settings.items"], ["a"]);
  assert.deepEqual(
    calls.slice(2).map((call) => [call.method, call.url, call.body]),
    [
      ["POST", "/api/Module/Settings/Home/mode", '"a"'],
      ["DELETE", "/api/Module/Settings/items", undefined],
    ],
  );
  assert.deepEqual(
    notifications.map((event) => [event.kind, event.operation]),
    [
      ["success", "write"],
      ["success", "delete"],
    ],
  );
});

test("non-200, network and invalid value errors notify and preserve cached values", async () => {
  const { client, calls, notifications, state } = fixture();
  await client.open("Module");
  const previous = client.snapshot("Module");
  for (const status of [204, 400, 500]) {
    state.status = status;
    await assert.rejects(client.set("Module", "Module.Settings.Home.mode", "a"), new RegExp(`HTTP ${status}`));
    await assert.rejects(client.remove("Module", "Module.Settings.items"));
  }
  state.error = new Error("offline");
  await assert.rejects(client.set("Module", "Module.Settings.Home.mode", "a"), /offline/);
  const count = calls.length;
  await assert.rejects(client.set("Module", "Module.Settings.count", NaN), /Invalid/);
  assert.equal(calls.length, count);
  assert.deepEqual(client.snapshot("Module"), previous);
  assert.equal(notifications.length, 8);
  assert.ok(notifications.every((event) => event.kind === "error"));
});

test("every entry or refresh replaces config and values; failed reopen clears stale cache", async () => {
  const { client, calls, state } = fixture();
  await client.open("Module");
  client.leave("Module");
  assert.throws(() => client.snapshot("Module"), /Open/);
  state.config = [...config, { id: "@Example.Module.Settings.added", name: "Added", type: "boolean", val: true }];
  state.stored = { count: 9 };
  await client.open("Module");
  assert.equal(client.snapshot("Module").values["Module.Settings.added"], true);
  assert.equal(client.snapshot("Module").values["Module.Settings.count"], 9);
  state.stored = { count: 10 };
  await client.open("Module");
  assert.equal(client.snapshot("Module").values["Module.Settings.count"], 10);
  assert.equal(calls.filter((call) => call.method === "GET").length, 6);
  state.status = 404;
  assert.equal(await client.probe("Module"), false);
  await assert.rejects(client.open("Module"));
  assert.throws(() => client.snapshot("Module"), /Open/);
});

test("leaving cancels pending entry; an older entry cannot restore a replaced session", async () => {
  const pending = [];
  const client = createPreferencesClient({ fetch: (url, options) => new Promise((resolve) => pending.push({ url, options, resolve })) });
  const first = client.open("Module");
  const second = client.open("Module");
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve(Response.json(config));
  await new Promise((resolve) => setImmediate(resolve));
  pending[2].resolve(Response.json({ count: 7 }));
  await second;
  pending[0].resolve(Response.json(config));
  await new Promise((resolve) => setImmediate(resolve));
  pending[3].resolve(Response.json({ count: 3 }));
  await assert.rejects(first, /replaced/);
  assert.equal(client.snapshot("Module").values["Module.Settings.count"], 7);
  client.leave("Module");
  assert.throws(() => client.snapshot("Module"), /Open/);
});

test("writes are serialized and completing after leave cannot resurrect cache", async () => {
  let finish;
  const notifications = [];
  const client = createPreferencesClient({
    notify: (event) => notifications.push(event),
    fetch: async (url, options) => {
      if (options.method === "POST")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return Response.json(url === "/api/Module/" ? config : {});
    },
  });
  await client.open("Module");
  const write = client.set("Module", "Module.Settings.count", 2);
  await assert.rejects(client.open("Module"), /saving/);
  await assert.rejects(client.set("Module", "Module.Settings.count", 3), /progress/);
  client.leave("Module");
  finish(Response.json({ saved: true }));
  await write;
  assert.throws(() => client.snapshot("Module"), /Open/);
  assert.equal(notifications[0].kind, "success");
});
