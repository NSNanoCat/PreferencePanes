import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserSources = ["../src/browser/page.mjs", "../src/browser/components.mjs", "../src/browser/styles.css", "../src/browser/panel.mjs", "../src/browser/styles.mjs"];

test("browser renderer has no client-specific SDK or stylesheet dependency", async () => {
    for (const path of browserSources) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /bilibili|bili_dark|hdslb|b-style|js-bridge/i, path);
    }
});

test("built renderer contains no client-specific stylesheet", async () => {
    for (const path of ["../dist/preference-panes.mjs", "../dist/home.html", "../dist/navigation.mjs", "../dist/api.js"]) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /bilibili|bili_dark|hdslb|b-style|js-bridge/i, path);
        assert.doesNotMatch(source, /s1\.hdslb\.com/i, path);
    }
});

test("default styles are inserted before the optional project stylesheet", async () => {
    const styles = await readFile(new URL("../src/browser/styles.mjs", import.meta.url), "utf8");
    assert.match(styles, /link\[data-preference-panes-stylesheet\]/);
    assert.match(styles, /insertBefore\(element, document\.head\.querySelector\(stylesheetSelector\)\)/);
});

test("module renderer omits the search toolbar row", async () => {
    for (const path of ["../src/browser/panel.mjs", "../src/browser/styles.css"]) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /pp-toolbar|pp-search|pp-module-logo|搜索设置项/, path);
    }
});

test("loading and retry states share the centered status component", async () => {
    const components = await readFile(new URL("../src/browser/components.mjs", import.meta.url), "utf8");
    const panel = await readFile(new URL("../src/browser/panel.mjs", import.meta.url), "utf8");
    const app = await readFile(new URL("../src/browser/page.mjs", import.meta.url), "utf8");
    const styles = await readFile(new URL("../src/browser/styles.css", import.meta.url), "utf8");
    assert.match(components, /export function statusView/);
    assert.match(panel, /statusView\("读取设置…"\)/);
    assert.match(app, /statusView\("正在打开设置…"\)/);
    assert.match(styles, /\.pp-status \{[\s\S]*place-content: center;[\s\S]*justify-items: center;/);
    assert.match(styles, /\.pp-status-spinner/);
    assert.match(styles, /\.pp-status-action/);
    assert.doesNotMatch(components, /pp-error/);
    assert.doesNotMatch(panel, /pp-loading/);
});

test("stored value compatibility issues render as field-level warnings", async () => {
    const panel = await readFile(new URL("../src/browser/panel.mjs", import.meta.url), "utf8");
    const styles = await readFile(new URL("../src/browser/styles.css", import.meta.url), "utf8");
    assert.match(panel, /当前配置未定义值：/);
    assert.match(panel, /当前存储值格式不受支持：/);
    assert.match(panel, /client\.snapshot\(\)\.warnings\[field\.key\]/);
    assert.match(styles, /--pp-warning:/);
    assert.match(styles, /\.pp-field-warning \{[\s\S]*color: var\(--pp-warning\);/);
});

test("browser keeps storage and the public mount entry separate from host implementation", async () => {
    const api = await readFile(new URL("../src/api.mjs", import.meta.url), "utf8");
    const browser = await import("../dist/preference-panes.mjs");
    assert.doesNotMatch(api, /normalizeBoxJs|validValue|document\.|ModuleFrame|configURL/);
    assert.deepEqual(Object.keys(browser), ["mount"]);
});
