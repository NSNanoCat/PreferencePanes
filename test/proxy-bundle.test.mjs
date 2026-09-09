import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { rollup } from "rollup";
import builds from "../rollup.config.mjs";

const bundle = await rollup(builds[1]);
const { output } = await bundle.generate(builds[1].output);
await bundle.close();
const code = output[0].code;
const factory = await rollup(builds[3]);
const { output: factoryOutput } = await factory.generate(builds[3].output);
await factory.close();
const installation = { origin: "https://example.org", storageKey: "Example", module: "Module", resources: [{ pattern: "^/configs/Module$", source: "https://example.org/assets/module.json", contentType: "application/json" }] };
const installedCode = `${factoryOutput[0].code}\nPreferencePanes.runPreferences(${JSON.stringify(installation)});`;

for (const platform of ["surge", "quantumult"]) {
    for (const installed of [false, true])
        test(`${platform}: ${installed ? "site-installed" : "argument"} bundle preserves persistence without consumer code`, async () => {
            const store = new Map([["Example", JSON.stringify({ Other: { secret: 7 } })]]);
            let reads = 0,
                requests = 0;
            const run = (method, path = "Module/Settings/count", body) =>
                new Promise(resolve => {
                    const context = {
                        setTimeout: (callback, delay) => setTimeout(callback, delay).unref(),
                        clearTimeout,
                        console: { log() {}, error() {} },
                        ...(installed ? {} : { $argument: "origin=https://example.org&storageKey=Example&module=Module" }),
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
                        requests++;
                        if (request.url === "https://example.org/assets/module.json") return { statusCode: 200, status: 200, headers: {}, body: "[]" };
                        throw new Error("No network access allowed for storage API");
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
                    vm.runInNewContext(installed ? installedCode : code, context, { timeout: 1000 });
                });
            const unwrap = response => (platform === "surge" ? response.response : response);
            const status = response => (platform === "surge" ? response.status : Number(response.status.split(" ")[1]));
            const probe = await run("HEAD", "/configs/Module");
            if (installed) {
                assert.equal(status(unwrap(probe)), 200);
                assert.equal(unwrap(probe).body, "");
            } else assert.deepEqual(JSON.parse(JSON.stringify(probe)), {});
            assert.equal(requests, installed ? 1 : 0);
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
            response = unwrap(await run("POST", undefined, "10"));
            assert.equal(status(response), 200);
            response = unwrap(await run("DELETE", "Module/"));
            assert.equal(status(response), 200);
            assert.deepEqual(JSON.parse(store.get("Example")), { Other: { secret: 7 } });
            assert.equal(requests, installed ? 1 : 0);
        });
}

test("bundles contain no Node imports or compiled-in module fields", () => {
    assert.doesNotMatch(code, /node:fs|node-fetch|require\(/);
    assert.doesNotMatch(code, /@Example\.Module|BiliBili|Enhanced\.Settings/);
    assert.doesNotMatch(code, /normalizeBoxJs|parseBoxJs|configURL|BoxJS source HTTP/);
});

test("browser bundle contains no proxy polyfills or third-party dependencies", async () => {
    const browser = await rollup(builds[0]);
    try {
        const { output } = await browser.generate(builds[0].output);
        assert.equal(
            Object.entries(output[0].modules).some(([id, module]) => id.includes("/node_modules/") && module.renderedLength > 0),
            false,
        );
    } finally {
        await browser.close();
    }
});
