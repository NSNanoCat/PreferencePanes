import assert from "node:assert/strict";
import test from "node:test";
import { installation } from "../src/lib/installation.mjs";

test("installation files derive their source from runtime URL and keep config rules independent", () => {
    const url = new URL("https://example.org/settings/");
    for (const platform of ["surge", "loon", "quantumult", "stash", "shadowrocket"]) {
        const core = installation(platform, url);
        const mock = installation(platform, url, "Module");
        assert.ok(core.text.includes("https://example.org/settings/assets/PreferencePanes.request.js"));
        assert.doesNotMatch(core.text, /configs/);
        assert.doesNotMatch(mock.text, /\/api|PreferencePanes\.request/);
        assert.ok(mock.text.includes("Module.boxjs.json") || mock.text.includes("Module.config.js"));
        for (const text of [core.text, mock.text]) {
            const patterns = text
                .split("\n")
                .flatMap(line => {
                    if (line.includes("pattern=")) return [line.match(/pattern=([^,]+)/)[1]];
                    if (line.includes("- match:")) return [line.trim().slice("- match: ".length)];
                    if (line.startsWith("http-request ")) return [line.split(" ")[1]];
                    return line.startsWith("^") ? [line.split(" ")[0]] : [];
                })
                .map(pattern => new RegExp(pattern));
            assert.ok(patterns.length);
            assert.equal(
                patterns.some(pattern => pattern.test("https://example.org/api/Module/Settings/key")),
                text === core.text,
            );
            assert.ok(patterns.every(pattern => !pattern.test("https://exampleXorg/api/Module/")));
            assert.ok(patterns.every(pattern => !pattern.test("https://example.org/settings/assets/PreferencePanes.request.js")));
            assert.equal(
                patterns.some(pattern => pattern.test("https://example.org/configs/Module")),
                text === mock.text,
            );
        }
    }
});
