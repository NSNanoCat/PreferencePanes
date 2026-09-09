import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createPreferencesClient } from "../src/browser/client.mjs";
import { config } from "./fixtures/module.mjs";

test("missing or invalid module never sends a request", async () => {
	const { client, calls } = fixture();
	for (const module of [undefined, "", "Module/Other", "__proto__", "https://example.org/config.json"]) {
		await assert.rejects(client.open(module));
		assert.equal(await client.probe(module), false);
	}
	assert.equal(calls.length, 0);
});

test("missing or invalid BoxJS blocks the form even when the storage API is available", async () => {
	for (const body of [null, [], { apps: [] }]) {
		const calls = [];
		const client = createPreferencesClient({
			fetch: async (path, options) => {
				calls.push([options.method, path]);
				if (path.startsWith("/api/")) return Response.json({ count: 9 });
				return new Response(options.method === "HEAD" ? null : JSON.stringify(body), { status: body === null ? 404 : 200 });
			},
		});
		assert.equal(await client.probe("Module"), body !== null);
		await assert.rejects(client.open("Module"));
		assert.throws(() => client.snapshot("Module"), /Open/);
		assert.deepEqual(calls, [
			["HEAD", "/configs/Module"],
			["GET", "/configs/Module"],
		]);
	}
});

test("native subtree reads preserve falsy values and default only for undefined", async () => {
	const { client, state } = fixture();
	state.stored = { Home: { enabled: false, mode: "a" }, items: [], count: 0, note: "" };
	const { values } = await client.open("Module");
	assert.equal(values["Module.Settings.Home.enabled"], false);
	assert.equal(values["Module.Settings.count"], 0);
	assert.equal(values["Module.Settings.note"], "");
	assert.deepEqual(values["Module.Settings.items"], []);
	state.stored = { Home: null, note: null };
	const reopened = await client.open("Module");
	assert.equal(reopened.values["Module.Settings.Home.enabled"], true);
	assert.equal(reopened.values["Module.Settings.note"], null);
	assert.equal(reopened.values["Module.Settings.count"], 1);
});

test("template config Mock and API script patterns are disjoint regardless of rule order", async () => {
	const template = await readFile(new URL("../examples/surge.sgmodule", import.meta.url), "utf8");
	const mock = new RegExp(
		template
			.split("\n")
			.find(line => line.startsWith("^") && line.includes("/configs/"))
			.split(" ")[0],
	);
	const script = new RegExp(template.match(/pattern=([^,]+)/)[1]);
	const page = new RegExp(
		template
			.split("\n")
			.find(line => line.startsWith("^") && line.includes("/settings/"))
			.split(" ")[0],
	);
	assert.equal(page.test("https://example.org/settings/Module"), true);
	assert.equal(page.test("https://example.org/settings/?module=Module"), false);
	assert.equal(page.test("https://example.org/settings/Other"), true);
	for (const url of ["https://example.org/configs/Module", "https://example.org/api/Module/", "https://example.org/api/Module/Settings/", "https://example.org/api/Module/Settings/enabled"]) {
		assert.equal(Number(mock.test(url)) + Number(script.test(url)), 1, url);
		assert.equal(mock.test(url), url.includes("/configs/"));
	}
	assert.equal(script.test("https://example.org/api/ModuleOther/Settings/"), false);
	assert.equal(mock.test("https://example.org/configs/Other"), false);
});

function fixture() {
	const calls = [],
		notifications = [];
	const state = { config, stored: { Home: { enabled: "false", mode: "b" }, items: "a,b" }, status: 200 };
	const client = createPreferencesClient({
		notify: event => notifications.push(event),
		fetch: async (url, options) => {
			calls.push({ url, ...options });
			if (state.error) throw state.error;
			const data = url === "/configs/Module" ? state.config : url === "/api/Module/Caches" ? state.caches : state.stored;
			const status = options.method === "GET" && url === "/api/Module/Settings/" ? (state.settingsStatus ?? state.status) : state.status;
			const body = options.method === "HEAD" || status === 204 ? null : JSON.stringify(data);
			return new Response(body, { status });
		},
	});
	return { client, calls, notifications, state };
}

test("fresh or reset modules load defaults when their stored subtree is absent", async () => {
	const { client, state, calls } = fixture();
	state.settingsStatus = 404;
	const result = await client.open("Module");
	assert.equal(result.values["Module.Settings.Home.enabled"], true);
	assert.equal(result.values["Module.Settings.count"], 1);
	assert.equal(calls.length, 2);
	state.settingsStatus = 200;
	state.stored = JSON.stringify({ count: 9 });
	assert.equal((await client.open("Module")).values["Module.Settings.count"], 9);
});

test("cache inspection is explicit; clear and reset use DELETE without follow-up GET", async () => {
	const { client, state, calls, notifications } = fixture();
	state.caches = { items: [1, 2] };
	await client.open("Module");
	assert.equal(calls.length, 2);
	const settings = client.snapshot("Module").values;
	assert.deepEqual(await client.readCaches("Module"), { items: [1, 2] });
	await client.clearCaches("Module");
	assert.deepEqual(client.snapshot("Module").values, settings);
	await client.reset("Module");
	assert.equal(client.snapshot("Module").values["Module.Settings.Home.enabled"], true);
	assert.deepEqual(
		calls.slice(2).map(({ method, url }) => [method, url]),
		[
			["GET", "/api/Module/Caches"],
			["DELETE", "/api/Module/Caches"],
			["DELETE", "/api/Module"],
		],
	);
	assert.deepEqual(
		notifications.map(({ operation }) => operation),
		["clearCaches", "reset"],
	);
	state.status = 500;
	const before = client.snapshot("Module");
	await assert.rejects(client.reset("Module"), /HTTP 500/);
	assert.deepEqual(client.snapshot("Module"), before);
	assert.equal(notifications.at(-1).kind, "error");
});

test("menu probes only HEAD; opening loads config and subtree exactly once", async () => {
	const { client, calls } = fixture();
	await Promise.all([client.probe("Module"), client.probe("Other")]);
	assert.deepEqual(
		calls.map(call => [call.method, call.url]),
		[
			["HEAD", "/configs/Module"],
			["HEAD", "/configs/Other"],
		],
	);
	const { values } = await client.open("Module");
	assert.equal(values["Module.Settings.Home.enabled"], false);
	assert.deepEqual(values["Module.Settings.items"], ["a", "b"]);
	assert.equal(values["Module.Settings.count"], 1);
	client.snapshot("Module");
	assert.deepEqual(
		calls.slice(2).map(call => [call.method, call.url]),
		[
			["GET", "/configs/Module"],
			["GET", "/api/Module/Settings/"],
		],
	);
	assert.ok(calls.every(call => call.cache === "no-store"));
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
		calls.slice(2).map(call => [call.method, call.url, call.body]),
		[
			["POST", "/api/Module/Settings/Home/mode", '"a"'],
			["DELETE", "/api/Module/Settings/items", undefined],
		],
	);
	assert.deepEqual(
		notifications.map(event => [event.kind, event.operation]),
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
	await assert.rejects(client.set("Module", "Module.Settings.count", Number.NaN), /Invalid/);
	assert.equal(calls.length, count);
	assert.deepEqual(client.snapshot("Module"), previous);
	assert.equal(notifications.length, 8);
	assert.ok(notifications.every(event => event.kind === "error"));
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
	assert.equal(calls.filter(call => call.method === "GET").length, 6);
	state.status = 404;
	assert.equal(await client.probe("Module"), false);
	await assert.rejects(client.open("Module"));
	assert.throws(() => client.snapshot("Module"), /Open/);
});

test("leaving cancels pending entry; an older entry cannot restore a replaced session", async () => {
	const pending = [];
	const client = createPreferencesClient({ fetch: (url, options) => new Promise(resolve => pending.push({ url, options, resolve })) });
	const first = client.open("Module");
	const second = client.open("Module");
	assert.equal(pending[0].options.signal.aborted, true);
	pending[1].resolve(Response.json(config));
	await new Promise(resolve => setImmediate(resolve));
	pending[2].resolve(Response.json({ count: 7 }));
	await second;
	pending[0].resolve(Response.json(config));
	await new Promise(resolve => setImmediate(resolve));
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
		notify: event => notifications.push(event),
		fetch: async (url, options) => {
			if (options.method === "POST")
				return new Promise(resolve => {
					finish = resolve;
				});
			return Response.json(url === "/configs/Module" ? config : {});
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
