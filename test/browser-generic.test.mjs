import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserSources = ["../src/browser/index.mjs", "../src/browser/components.mjs", "../src/browser/panel.css", "../src/browser/panel.mjs"];

test("browser renderer has no client-specific SDK or stylesheet dependency", async () => {
    for (const path of browserSources) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /bilibili|bili_dark|hdslb|b-style|js-bridge/i, path);
    }
});

test("built renderer contains generic defaults without remote stylesheets", async () => {
    for (const path of ["../dist/preference-panes.mjs", "../dist/module/app.mjs", "../dist/api.js"]) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        assert.doesNotMatch(source, /bilibili|bili_dark|hdslb|b-style|js-bridge/i, path);
        assert.doesNotMatch(source, /<link[^>]+stylesheet|s1\.hdslb\.com/i, path);
    }
});
