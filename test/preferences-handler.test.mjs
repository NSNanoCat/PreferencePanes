import assert from "node:assert/strict";
import test from "node:test";
import { rollup } from "rollup";
import pkg from "../package.json" with { type: "json" };
import builds from "../rollup.config.mjs";

const store = new Map();
let downloads = 0;
globalThis.$environment = { "surge-version": "test" };
globalThis.$persistentStore = {
    read: key => store.get(key),
    write: (value, key) => {
        store.set(key, value);
        return true;
    },
};
globalThis.$httpClient = {
    get(request, done) {
        downloads++;
        done(null, { status: 200, headers: {} }, request.url.endsWith(".json") ? "[]" : "<html></html>");
    },
};
const { PreferencesHandler } = await import("../src/index.mjs");
const handler = new PreferencesHandler({
    origin: "https://example.org",
    storageKey: "Root",
    module: "Module",
    resources: [
        { pattern: "^/configs/Module$", source: "https://assets.example.org/Module.json", contentType: "application/json" },
        { pattern: "^/settings/(?:[a-zA-Z0-9_-]+/?)?$", source: "https://assets.example.org/index.html", contentType: "text/html" },
    ],
});

test("generic resource handling never turns API calls into configuration requests", async () => {
    const request = { url: "https://example.org/api/Module/Settings/key", method: "POST", headers: { "X-Settings-Client": "1", "Content-Type": "application/json" }, body: "false" };
    assert.equal((await handler.handle(request)).status, 200);
    assert.equal(downloads, 0);
    assert.equal((await handler.handle({ ...request, url: "https://example.org/configs/Module", method: "HEAD" })).body, "");
    assert.equal(downloads, 1);
    const html = await handler.handle({ ...request, url: "https://example.org/settings/Module", method: "GET" });
    assert.equal(html.body, "<html></html>");
    assert.match(html.headers["Content-Type"], /text\/html/);
    assert.equal(await handler.handle({ ...request, url: "https://example.org/settings/assets/index.html" }), undefined);
    assert.equal((await handler.handle({ ...request, url: "https://example.org/configs/Module" })).status, 405);
    assert.equal(downloads, 2);
});

test("site build emits a complete generic page without consumer branding", async () => {
    const bundle = await rollup(builds[2]);
    try {
        const { output } = await bundle.generate(builds[2].output);
        assert.deepEqual(output.map(file => file.fileName).sort(), ["app.mjs", "home.css", "index.html", "panel.css"]);
        assert.ok(output.find(file => file.fileName === "index.html").source.includes(`v=${pkg.version}`));
        const app = output.find(file => file.fileName === "app.mjs").code;
        assert.doesNotMatch(app, /biliverse\.github\.io|\bEnhanced\b|\bADBlock\b/);
        assert.match(app, /site\.boxjs\.json/);
    } finally {
        await bundle.close();
    }
});
