import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { rollup } from "rollup";
import builds from "../rollup.config.mjs";
import { config } from "./fixtures/module.mjs";

const bundle = await rollup(builds[1]);
const { output } = await bundle.generate(builds[1].output);
await bundle.close();
const code = output[0].code;

for (const platform of ["surge", "quantumult"]) {
	test(`${platform}: standalone bundle works without browser globals and preserves persistence siblings`, async () => {
		const store = new Map([["Example", JSON.stringify({ Other: { secret: 7 } })]]);
		let reads = 0,
			requests = 0,
			sourceStatus = 200;
		const run = (method, path = "Module/Settings/count", body) =>
			new Promise(resolve => {
				const context = {
					setTimeout: (callback, delay) => setTimeout(callback, delay).unref(),
					clearTimeout,
					console: { log() {}, error() {} },
					$argument: "origin=https://example.org&configURL=https://assets.example.org/Module.boxjs.json",
					$request: {
						method,
						url: path.startsWith("/") ? `https://example.org${path}` : `https://example.org/api/${path}`,
						body,
						headers: { "X-Settings-Client": "1", "Content-Type": "application/json" },
					},
					$script: { startTime: Date.now() / 1000 },
					$done: resolve,
				};
				const read = key => {
					reads++;
					return store.get(key);
				};
				const write = (value, key) => {
					store.set(key, value);
					return true;
				};
				const fetch = request => {
					assert.equal(request.url, "https://assets.example.org/Module.boxjs.json");
					requests++;
					return { status: sourceStatus, statusCode: sourceStatus, headers: {}, body: JSON.stringify(config) };
				};
				if (platform === "surge") {
					context.$environment = { "surge-version": "test" };
					context.$persistentStore = { read, write };
					context.$httpClient = {
						get(request, callback) {
							const response = fetch(request);
							callback(null, response, response.body);
						},
					};
				} else {
					context.$prefs = { valueForKey: read, setValueForKey: write };
					context.$task = { fetch: async request => fetch(request) };
				}
				vm.runInNewContext(code, context, { timeout: 1000 });
			});
		const unwrap = response => (platform === "surge" ? response.response : response);
		const status = response => (platform === "surge" ? response.status : Number(response.status.split(" ")[1]));
		assert.deepEqual(JSON.parse(JSON.stringify(await run("HEAD", "/configs/Module"))), {});
		assert.equal(requests, 0);
		assert.equal(reads, 0);
		let response = unwrap(await run("POST", undefined, "9"));
		assert.equal(status(response), 200, response.body);
		assert.deepEqual(JSON.parse(response.body), { saved: true });
		assert.equal(JSON.parse(store.get("Example")).Other.secret, 7);
		response = unwrap(await run("GET", "Module/Settings/"));
		assert.equal(status(response), 200, response.body);
		assert.deepEqual(JSON.parse(response.body), { count: 9 });
		response = unwrap(await run("DELETE"));
		assert.equal(status(response), 200, response.body);
		assert.equal(JSON.parse(store.get("Example")).Module.Settings.count, undefined);
		sourceStatus = 503;
		const previousReads = reads;
		response = unwrap(await run("POST", undefined, "10"));
		assert.equal(status(response), 502);
		assert.equal(reads, previousReads);
	});
}

test("bundles contain no Node imports or compiled-in module fields", () => {
	assert.doesNotMatch(code, /node:fs|node-fetch|require\(/);
	assert.doesNotMatch(code, /@Example\.Module|BiliBili|Enhanced\.Settings/);
});

test("browser bundle does not include the proxy URL polyfill", async () => {
	const browser = await rollup(builds[0]);
	try {
		const { output } = await browser.generate(builds[0].output);
		assert.equal(
			Object.keys(output[0].modules).some(id => id.includes("/@nsnanocat/url/")),
			false,
		);
	} finally {
		await browser.close();
	}
});
