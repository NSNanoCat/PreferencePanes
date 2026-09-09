import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadOfficialOverrides } from "../examples/official-overrides.mjs";

test("official styles remain byte-identical to the recorded app assets", async () => {
    const root = new URL("./fixtures/official-styles/", import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("provenance.json", root), "utf8"));
    for (const { file, sha256 } of manifest.files) {
        const bytes = await readFile(new URL(file, root));
        assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256, file);
    }
});

test("production artifacts contain only official URLs, never fixture CSS or local overrides", async () => {
    const urls = Object.keys(JSON.parse(await readFile(new URL("../src/browser/official-styles.json", import.meta.url), "utf8")));
    for (const file of ["api.js", "module/app.mjs", "preference-panes.mjs"]) {
        const source = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
        for (const url of urls) assert.ok(source.includes(url), `${file}: ${url}`);
        assert.doesNotMatch(source, /@bilibili\/b-style|--Ga0:|v-toggle--small\{width|__official__|official-styles\.zip|settings\/official\//);
    }
});

test("local style overrides preserve production files and resolve only fixture assets", async () => {
    const overrides = await loadOfficialOverrides();
    const file = new URL("../dist/module/app.mjs", import.meta.url);
    const source = await readFile(file, "utf8");
    const modified = overrides.rewrite(source);
    assert.ok(modified.includes("/__official__/theme.min.css"));
    assert.ok(overrides.asset("/__official__/theme.min.css").includes(Buffer.from("@bilibili/b-style")));
    assert.equal(overrides.asset("/__official__/unknown.css"), undefined);
    assert.equal(await readFile(file, "utf8"), source);
});
