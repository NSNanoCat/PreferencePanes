import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("import testbench starts empty and generates only the uploaded module", { timeout: 15000 }, async () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../examples/preview.mjs", import.meta.url))], { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
    try {
        const base = await new Promise((resolve, reject) => {
            let text = "";
            child.stdout.on("data", chunk => {
                text += chunk;
                const match = /http:\/\/127\.0\.0\.1:\d+\//.exec(text);
                if (match) resolve(match[0]);
            });
            child.once("error", reject);
            child.once("exit", code => reject(new Error(`Preview exited: ${code}`)));
        });
        const page = await (await fetch(base)).text();
        assert.match(page, /type="file"/);
        assert.match(page, /id="generate".*disabled/);
        assert.match(page, /iframe.*hidden/);
        assert.doesNotMatch(page, /pp-home|data-module|安装模块/);
        assert.equal((await fetch(`${base}configs/Module`)).status, 404);
        const boxjs = [{ id: "@Root.Module.flag", name: "Flag", type: "boolean", val: true }];
        const result = await fetch(`${base}preview`, { method: "POST", body: JSON.stringify({ boxjs, css: "body { color: green; }" }) });
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { url: "/settings/Module/", module: "Module" });
        assert.deepEqual(await (await fetch(`${base}configs/Module`)).json(), boxjs);
        assert.equal(await (await fetch(`${base}settings/assets/Module.css`)).text(), "body { color: green; }");
        assert.equal((await fetch(`${base}configs/Other`)).status, 404);
        assert.equal((await fetch(`${base}preview`, { method: "POST", body: "{" })).status, 400);
        assert.equal((await fetch(`${base}configs/Module`)).status, 404);
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, "exit");
            child.kill();
            await exited;
        }
    }
});
