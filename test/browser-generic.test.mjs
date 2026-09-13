import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserSources = ["../src/browser/index.mjs", "../src/browser/components.mjs", "../src/browser/panel.css", "../src/browser/panel.mjs", "../src/browser/styles.mjs"];

test("browser renderer has no client-specific SDK or stylesheet dependency", async () => {
    for (const path of browserSources) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /bilibili|bili_dark|hdslb|b-style|js-bridge/i, path);
    }
});

test("built renderer contains generic defaults without remote stylesheets", async () => {
    for (const path of ["../dist/preference-panes.mjs", "../dist/module/index.mjs", "../dist/api.js", "../dist/web.js"]) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /bilibili|bili_dark|hdslb|b-style|js-bridge/i, path);
        assert.doesNotMatch(source, /<link[^>]+stylesheet|s1\.hdslb\.com/i, path);
    }
});

test("module renderer omits the search toolbar row", async () => {
    for (const path of ["../src/browser/panel.mjs", "../src/browser/panel.css"]) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /pp-toolbar|pp-search|pp-module-logo|搜索设置项/, path);
    }
});

test("loading and retry states share the centered status component", async () => {
    const components = await readFile(new URL("../src/browser/components.mjs", import.meta.url), "utf8");
    const panel = await readFile(new URL("../src/browser/panel.mjs", import.meta.url), "utf8");
    const app = await readFile(new URL("../src/browser/index.mjs", import.meta.url), "utf8");
    const styles = await readFile(new URL("../src/browser/panel.css", import.meta.url), "utf8");
    assert.match(components, /export function statusView/);
    assert.match(panel, /statusView\("读取设置…"\)/);
    assert.match(app, /statusView\("读取设置…"\)/);
    assert.match(styles, /\.pp-status \{[\s\S]*place-content: center;[\s\S]*justify-items: center;/);
    assert.match(styles, /\.pp-status-spinner/);
    assert.match(styles, /\.pp-status-action/);
    assert.doesNotMatch(components, /pp-error/);
    assert.doesNotMatch(panel, /pp-loading/);
});

test("proxy and browser sources keep storage, validation and navigation responsibilities separate", async () => {
    const api = await readFile(new URL("../src/api.mjs", import.meta.url), "utf8");
    const web = await readFile(new URL("../src/web.mjs", import.meta.url), "utf8");
    const navigation = await readFile(new URL("../src/browser/Navigation.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(api, /normalizeBoxJs|normalizeStoredValue|validValue|mountPanel|document\.|module\.html|#assets/);
    assert.doesNotMatch(web, /Storage|@nsnanocat\/util"|transport|\/api\//);
    assert.doesNotMatch(navigation, /BoxJS|Storage|api\/(?:get|set|delete)/);
    assert.doesNotMatch(api + web, /X-PreferencePanes-(?:JSON|CSS)|configURL/);
});

test("browser lifecycle keeps page and view classes internal", async () => {
    const page = await readFile(new URL("../src/browser/index.mjs", import.meta.url), "utf8");
    const view = await readFile(new URL("../src/browser/mount.mjs", import.meta.url), "utf8");
    const panel = await readFile(new URL("../src/browser/panel.mjs", import.meta.url), "utf8");
    const client = await readFile(new URL("../src/browser/client.mjs", import.meta.url), "utf8");
    const browser = await import("../dist/preference-panes.mjs");
    assert.match(page, /class ModulePage/);
    assert.match(page, /mount\(await response\.json\(\)\)/);
    assert.match(view, /class PreferencesView/);
    assert.match(view, /new PreferencesPanel/);
    assert.match(panel, /export class PreferencesPanel/);
    assert.match(panel, /new PreferencesClient/);
    assert.match(client, /export class PreferencesClient/);
    assert.deepEqual(Object.keys(browser), ["mount"]);
    assert.equal(typeof browser.mount, "function");
});
