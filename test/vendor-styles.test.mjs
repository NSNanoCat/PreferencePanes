import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("official styles remain byte-identical to the recorded app assets", async () => {
    const root = new URL("../src/browser/vendor/", import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("provenance.json", root), "utf8"));
    for (const { file, sha256 } of manifest.files) {
        const bytes = await readFile(new URL(file, root));
        assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256, file);
    }
});
