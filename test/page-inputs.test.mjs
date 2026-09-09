import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { pageInputs } from "../src/lib/page-inputs.mjs";

test("the exported Apifox collection contains all three route families and editable page inputs", async () => {
    const document = JSON.parse(await readFile(new URL("../apifox/preference-panes.apifox.json", import.meta.url), "utf8"));
    const apis = document.apiCollection[0].items.flatMap(folder => folder.items.map(item => item.api));
    for (const prefix of ["/settings/", "/configs/", "/api/"]) assert.ok(apis.some(api => api.path.startsWith(prefix)));
    const page = apis.find(api => api.path === "/settings/{module}");
    assert.deepEqual(
        page.parameters.query.map(parameter => parameter.name),
        ["json", "css"],
    );
    assert.deepEqual(
        page.parameters.header.map(parameter => parameter.name),
        ["X-PreferencePanes-JSON", "X-PreferencePanes-CSS"],
    );
    assert.ok([...page.parameters.query, ...page.parameters.header].every(parameter => !parameter.enable && parameter.example === ""));
});

test("resource headers override query values independently and preserve module defaults", () => {
    const url = new URL("https://example.org/settings/Module?json=%2Fcustom.json%3Flang%3Dzh&css=%2Ftheme.css");
    assert.equal(pageInputs(url).json, "/custom.json?lang=zh");
    const inputs = pageInputs(url, { "x-PREFERENCEpanes-JSON": "/header.json", "X-PreferencePanes-CSS": "" });
    assert.equal(inputs.json, "/header.json");
    assert.equal(inputs.css, "");
    assert.equal(inputs.module, "Module");
    assert.equal(pageInputs(url, { "X-PreferencePanes-JSON": "/header.json" }).css, "/theme.css");
    const defaults = pageInputs(new URL("https://example.org/settings/Module/"));
    assert.equal(defaults.json, "/configs/Module");
    assert.equal(defaults.css, "");
    assert.throws(() => pageInputs(new URL("https://example.org/settings/")), /concrete module/);
    assert.throws(() => pageInputs(url, { "X-PreferencePanes-JSON": "" }), /required/);
});

test("page responses carry header inputs without fetching resources or touching persistence", async () => {
    const api = await readFile(new URL("../dist/api.js", import.meta.url), "utf8");
    const malicious = '/theme.css?q="</head><script>alert(1)</script>';
    const response = await new Promise(resolve =>
        vm.runInNewContext(api, {
            $environment: { "surge-version": "test" },
            $script: { startTime: Date.now() / 1000 },
            $request: {
                url: "https://example.org/settings/Module?json=/query.json",
                method: "GET",
                headers: { "X-PreferencePanes-JSON": "/header.json", "X-PreferencePanes-CSS": malicious },
            },
            $done: result => resolve(result.response),
            console: { log() {}, error() {} },
        }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers["Cache-Control"], "no-store");
    const data = response.body.match(/name="preference-panes-inputs" content="([^"]+)"/)[1];
    assert.deepEqual(JSON.parse(decodeURIComponent(data)), {
        url: "https://example.org/settings/Module?json=/query.json",
        module: "Module",
        json: "/header.json",
        css: malicious,
    });
    assert.ok(!response.body.includes("<script>alert"));
});
