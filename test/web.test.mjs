import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../dist/web.js", import.meta.url), "utf8");

const hosts = [
    { name: "Surge", globals: { $environment: { "surge-version": "test" } } },
    { name: "Loon", globals: { $loon: {} } },
    { name: "Stash", globals: { $environment: { "stash-version": "test" } } },
    { name: "Shadowrocket", globals: { $rocket: {} } },
    { name: "Egern", globals: { Egern: {} } },
    { name: "Quantumult X", quantumult: true, globals: { $task: {} } },
];

for (const host of hosts)
    test(`${host.name}: web script serves pages and assets without intercepting APIs`, async () => {
        const run = (path, method = "GET", headers = {}) =>
            new Promise(resolve => {
                vm.runInNewContext(source, {
                    ...host.globals,
                    $request: { url: `https://example.org${path}`, method, headers },
                    $script: { startTime: Date.now() / 1000 },
                    $done: result => resolve(host.quantumult ? result : result.response),
                    console: { log() {}, error() {} },
                });
            });
        const status = value => (host.quantumult ? Number(value.status.split(" ")[1]) : value.status);
        const page = await run("/settings/Module");
        assert.equal(status(page), 200);
        assert.match(page.body, /<!doctype html>/i);
        assert.doesNotMatch(page.body, /data-preference-panes-stylesheet/);
        assert.doesNotMatch(page.body, /preference-panes-inputs|data-json|data-css/);

        const queryStyles = await run("/settings/Module?css=%2Fsettings%2Ftheme.css%3Fmode%3Dlight%26source%3Dquery");
        assert.match(queryStyles.body, /<link data-preference-panes-stylesheet rel="stylesheet" href="https:\/\/example\.org\/settings\/theme\.css\?mode=light&amp;source=query">/);

        const headerStyles = await run("/settings/Module?css=/query.css", "GET", { "x-preferencepanes-css": "../header.css?source=header&theme=dark" });
        assert.match(headerStyles.body, /href="https:\/\/example\.org\/header\.css\?source=header&amp;theme=dark"/);
        assert.doesNotMatch(headerStyles.body, /query\.css/);

        const disabledStyles = await run("/settings/Module?css=/query.css", "GET", { "X-PreferencePanes-CSS": "" });
        assert.doesNotMatch(disabledStyles.body, /data-preference-panes-stylesheet/);

        const invalidStyles = await run("/settings/Module?css=data:text/css,body%7Bcolor:red%7D");
        assert.equal(status(invalidStyles), 500);
        assert.deepEqual(JSON.parse(invalidStyles.body), { error: "CSS resource must use HTTP(S)" });
        for (const asset of ["index.mjs", "navigation.mjs"]) {
            const result = await run(`/settings/assets/${asset}`);
            assert.equal(status(result), 200);
            assert.match(result.body, /PreferencePanes|preference-panes/);
        }
        const legacy = await run("/settings/assets/app.mjs");
        if (host.quantumult) assert.deepEqual(JSON.parse(JSON.stringify(legacy)), {});
        else assert.equal(legacy, undefined);
        assert.equal(status(await run("/settings/Module", "POST")), 405);
        for (const path of ["/api/Module", "/configs/Module", "/settings/assets/host.mjs"]) {
            const result = await run(path);
            if (host.quantumult) assert.deepEqual(JSON.parse(JSON.stringify(result)), {});
            else assert.equal(result, undefined);
        }
    });
