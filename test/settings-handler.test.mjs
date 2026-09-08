import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { parseBoxJs } from "../src/lib/boxjs.mjs";
import { config } from "./fixtures/module.mjs";

const store = new Map();
let reads = 0,
	writes = 0,
	writable = true,
	downloads = 0,
	latest = config,
	sourceStatus = 200,
	sourceBody,
	sourceError;
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
globalThis.$httpClient = {
	get(request, done) {
		downloads++;
		assert.equal(request.url, "https://assets.example.org/Module.boxjs.json");
		assert.equal(request.headers["Cache-Control"], "no-cache");
		done(sourceError, { status: sourceStatus, headers: {} }, sourceBody ?? JSON.stringify(latest));
	},
};
const { SettingsHandler, normalizeBoxJs, parseSettingsPath } = await import("../src/index.mjs");
const options = { origin: "https://example.org", configURL: "https://assets.example.org/Module.boxjs.json" };
const req = (method, pathname = "Module/Settings/Home/enabled", value) => ({
	url: `https://example.org/api/${pathname}`,
	method,
	headers: { "X-Settings-Client": "1", "Content-Type": "application/json" },
	...(value === undefined ? {} : { body: JSON.stringify(value) }),
});
beforeEach(() => {
	store.clear();
	reads = 0;
	writes = 0;
	writable = true;
	downloads = 0;
	latest = config;
	sourceStatus = 200;
	sourceBody = undefined;
	sourceError = undefined;
});

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

test("proxy parser skips display attributes but keeps the same storage constraints", () => {
	const app = { settings: structuredClone(config), name: "Display", icons: ["icon.png"] };
	const full = normalizeBoxJs(app, "Module");
	const lean = parseBoxJs(app, "Module");
	assert.deepEqual(lean, {
		module: full.module,
		storageKey: full.storageKey,
		settingsPath: full.settingsPath,
		fields: full.fields.map(({ key, type, defaultValue, options }) => ({ key, type, defaultValue, ...(options ? { options: options.map(({ key }) => ({ key })) } : {}) })),
	});
	for (const field of app.settings) {
		for (const key of ["name", "desc", "placeholder", "rows", "autoGrow"])
			Object.defineProperty(field, key, {
				get() {
					throw new Error(`Read display field ${key}`);
				},
			});
		for (const item of field.items ?? [])
			Object.defineProperty(item, "label", {
				configurable: true,
				get() {
					throw new Error("Read label");
				},
			});
	}
	Object.defineProperty(app, "icons", {
		get() {
			throw new Error("Read icons");
		},
	});
	assert.deepEqual(parseBoxJs(app, "Module"), lean);
	assert.throws(() => normalizeBoxJs(app, "Module"), /Read display/);
});

test("proxy still rejects undeclared fields, invalid enum and cross-root configs without display data", async () => {
	latest = config.map(({ name, desc, ...field }) => ({ ...field, ...(field.items ? { items: field.items.map(({ key }) => ({ key })) } : {}) }));
	const handler = new SettingsHandler(options);
	assert.equal((await handler.handle(req("POST", "Module/Settings/Home/mode", "a"))).status, 200);
	assert.equal((await handler.handle(req("POST", "Module/Settings/Home/mode", "wrong"))).status, 400);
	assert.equal((await handler.handle(req("POST", "Module/Settings/secret", true))).status, 404);
	latest = [...latest, { id: "@Other.Module.Settings.other", type: "boolean", val: true }];
	assert.equal((await handler.handle(req("GET"))).status, 502);
	assert.equal(writes, 1);
});

test("custom GET resolvers retain their full module definition contract", async () => {
	latest = { name: "Module title", settings: config };
	const handler = new SettingsHandler({
		...options,
		resolveSettings(stored, definition) {
			assert.deepEqual(definition, normalizeBoxJs(latest, "Module"));
			return stored;
		},
	});
	assert.equal((await handler.handle(req("GET", "Module/Settings/"))).status, 200);
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

test("configuration resources bypass the persistence handler", async () => {
	const handler = new SettingsHandler(options);
	assert.equal(await handler.handle({ ...req("HEAD"), url: "https://example.org/configs/Module" }), undefined);
	assert.equal(await handler.handle({ ...req("GET"), url: "https://example.org/configs/Module" }), undefined);
	assert.equal(reads, 0);
	assert.equal(writes, 0);
	assert.equal(downloads, 0);
});

test("subtree GET reads storage once and exposes only runtime-declared fields", async () => {
	const handler = new SettingsHandler(options);
	store.set("Example", JSON.stringify({ Module: { Settings: { Home: { enabled: false }, hidden: "private" }, Caches: { token: 1 } } }));
	assert.deepEqual(JSON.parse((await handler.handle(req("GET", "Module/Settings/"))).body), { Home: { enabled: false } });
	assert.equal(reads, 1);
	assert.equal(downloads, 1);
	assert.equal((await handler.handle(req("HEAD", "Module/Settings/"))).status, 200);
	assert.equal(reads, 1);
});

test("API module root returns only persistence data, never BoxJS config", async () => {
	const handler = new SettingsHandler(options);
	store.set("Example", JSON.stringify({ Module: { Settings: { count: 3 }, Caches: { token: "hidden" } } }));
	assert.equal((await handler.handle(req("HEAD", "Module/"))).status, 200);
	assert.equal(reads, 0);
	assert.deepEqual(JSON.parse((await handler.handle(req("GET", "Module/"))).body), { Settings: { count: 3 } });
	assert.equal(reads, 1);
	assert.equal((await handler.handle(req("POST", "Module/", {}))).status, 405);
});

test("method dispatch preserves validation order and storage effects", async () => {
	const handler = new SettingsHandler(options);
	sourceError = new Error("offline");
	const unsupported = await handler.handle(req("PATCH"));
	assert.equal(unsupported.status, 405);
	assert.equal(unsupported.headers.Allow, "HEAD, GET, POST, DELETE");
	assert.equal(downloads, 0);
	assert.equal((await handler.handle({ ...req("PATCH"), headers: {} })).status, 403);
	sourceError = undefined;
	for (const method of ["POST", "DELETE"]) {
		assert.equal((await handler.handle(req(method, "Module/Settings/", {}))).status, 405);
		assert.equal(reads, 0);
		assert.equal(writes, 0);
	}
	assert.equal((await handler.handle(req("HEAD"))).body, "");
	assert.equal(reads, 0);
	assert.equal((await handler.handle(req("GET"))).status, 404);
	assert.equal(reads, 1);
	assert.equal((await handler.handle(req("POST", undefined, false))).status, 200);
	assert.equal(reads, 2);
	assert.equal(writes, 1);
	assert.equal((await handler.handle(req("DELETE"))).status, 200);
	assert.equal(reads, 3);
	assert.equal(writes, 2);
});

test("POST and DELETE return 200, use util and preserve hidden/sibling data", async () => {
	store.set("Example", JSON.stringify({ Module: { Settings: JSON.stringify({ Home: { secret: 7 } }), Caches: { x: 1 } }, Second: { Settings: { x: 3 } } }));
	const handler = new SettingsHandler(options);
	for (const [path, value] of [
		["Home/enabled", false],
		["items", []],
		["count", 0],
		["note", ""],
	]) {
		assert.equal((await handler.handle(req("POST", `Module/Settings/${path}`, value))).status, 200);
		assert.deepEqual(JSON.parse((await handler.handle(req("GET", `Module/Settings/${path}`))).body), value);
	}
	const deletion = req("DELETE");
	delete deletion.headers["Content-Type"];
	assert.equal((await handler.handle(deletion)).status, 200);
	assert.equal((await handler.handle(deletion)).status, 200);
	const root = JSON.parse(store.get("Example"));
	assert.deepEqual(root.Module.Settings.Home, { secret: 7 });
	assert.equal(root.Module.Caches.x, 1);
	assert.equal(root.Second.Settings.x, 3);
	assert.equal((await handler.handle(req("GET"))).status, 404);
});

test("fresh BoxJS takes effect without rebuilding handler", async () => {
	const handler = new SettingsHandler(options);
	assert.equal((await handler.handle(req("POST", "Module/Settings/added", true))).status, 404);
	latest = [...config, { id: "@Example.Module.Settings.added", name: "Added", type: "boolean", val: false }];
	assert.equal((await handler.handle(req("POST", "Module/Settings/added", true))).status, 200);
});

test("config HTTP errors, malformed JSON and network failure return 502 without storage access", async () => {
	const handler = new SettingsHandler(options);
	for (const status of [204, 404, 500]) {
		sourceStatus = status;
		assert.equal((await handler.handle(req("GET", "Module/Settings/"))).status, 502);
	}
	sourceStatus = 200;
	sourceBody = "{";
	assert.equal((await handler.handle(req("GET"))).status, 502);
	sourceBody = undefined;
	sourceError = new Error("offline");
	assert.equal((await handler.handle(req("GET"))).status, 502);
	assert.equal(reads, 0);
	assert.equal(writes, 0);
});

test("class validates config source and isolates instances", async () => {
	for (const configURL of [undefined, "http://example.org/a", "https://user:pass@example.org/a", "https://example.org/a#fragment"]) assert.throws(() => new SettingsHandler({ ...options, configURL }));
	const handler = new SettingsHandler({ ...options, requestHeader: "X-Custom-Client" });
	assert.equal((await handler.handle(req("GET"))).status, 403);
	assert.equal(downloads, 0);
	assert.equal((await new SettingsHandler(options).handle(req("HEAD"))).status, 200);
	assert.equal(downloads, 1);
});

test("invalid values, subtree writes and foreign origins never write", async () => {
	const handler = new SettingsHandler(options);
	assert.equal((await handler.handle(req("POST", "Module/Settings/", {}))).status, 405);
	assert.equal((await handler.handle(req("POST", "Module/Settings/Home/mode", "unknown"))).status, 400);
	assert.equal((await handler.handle(req("POST", "Module/Settings/items", ["a", "a"]))).status, 400);
	assert.equal((await handler.handle(req("POST", "Module/__proto__/x", 1))).status, 400);
	assert.equal((await handler.handle({ ...req("POST"), body: "{" })).status, 400);
	assert.equal((await handler.handle({ ...req("POST"), body: "false", headers: { "X-Settings-Client": "1", "Content-Type": "text/plain" } })).status, 415);
	assert.equal((await handler.handle({ ...req("DELETE"), headers: { Origin: "https://evil.org", "X-Settings-Client": "1" } })).status, 403);
	assert.equal(writes, 0);
});

test("write failure is not success; resolver is GET-only", async () => {
	const handler = new SettingsHandler({
		...options,
		resolveSettings() {
			throw Error("resolver failed");
		},
	});
	assert.equal((await handler.handle(req("POST", undefined, false))).status, 200);
	await assert.rejects(handler.handle(req("GET")), /resolver failed/);
	writable = false;
	assert.equal((await handler.handle(req("DELETE"))).status, 500);
});

test("paths support a trailing slash and reject malformed segments", () => {
	assert.deepEqual(parseSettingsPath(req("GET", "Module/").url), ["Module"]);
	assert.deepEqual(parseSettingsPath(req("GET").url), ["Module", "Settings", "Home", "enabled"]);
	assert.deepEqual(parseSettingsPath("https://example.org/api/%4Dodule/Settings/%6Eote/?query=1"), ["Module", "Settings", "note"]);
	for (const suffix of ["", "Module//", "a%2fb", "__proto__/x", "%ZZ", "Module/constructor", "Module/a.b", "Module/%5C"]) assert.throws(() => parseSettingsPath(`https://example.org/api/${suffix}`));
	assert.equal(parseSettingsPath("https://example.org/panel"), undefined);
});

test("raw BoxJS path segments and browser-style encoded input retain their distinct validation", () => {
	for (const key of ["bad/path", "bad%20path", "bad path", "prototype"]) assert.throws(() => normalizeBoxJs([{ ...config[0], id: `@Example.Module.Settings.${key}` }], "Module"));
	const field = normalizeBoxJs([{ ...config[0], id: "@Example.Module.Settings.valid_key-1" }], "Module").fields[0];
	assert.equal(field.key, "Module.Settings.valid_key-1");
});
