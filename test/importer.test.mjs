import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("preview testbench provides an all-control example and still accepts imported modules", { timeout: 15000 }, async () => {
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
        assert.match(page, /id="example"/);
        assert.match(page, /iframe.*hidden/);
        assert.doesNotMatch(page, /pp-home|data-module|安装模块/);
        assert.equal((await fetch(`${base}api/Module`)).status, 404);
        const builtIn = await fetch(`${base}example`, { method: "POST" });
        assert.equal(builtIn.status, 200);
        assert.deepEqual(await builtIn.json(), { url: "/settings/Module", module: "Module" });
        const example = await (await fetch(`${base}api/Module`)).json();
        assert.deepEqual(
            example.settings.map(setting => setting.type),
            ["boolean", "selects", "checkboxes", "text", "textarea", "number", "url"],
        );
        const stored = await fetch(`${base}api/get`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams([["@Example.Module.Settings", ""]]),
        });
        assert.deepEqual(await stored.json(), {
            enabled: false,
            mode: "legacy",
            items: ["first", "removed"],
            displayName: "内置示例",
            notes: "这些值来自预览服务器的内存存储。",
            retries: "not-a-number",
            categories: ["legacy-url-value"],
        });
        const boxjs = [{ id: "@Root.Module.flag", name: "Flag", type: "boolean", val: true }];
        const result = await fetch(`${base}preview`, { method: "POST", body: JSON.stringify({ boxjs }) });
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { url: "/settings/Module", module: "Module" });
        const configuration = await fetch(`${base}api/Module`);
        assert.equal(configuration.headers.get("X-PreferencePanes-Version"), "preview");
        assert.deepEqual(await configuration.json(), boxjs);
        assert.equal(
            (
                await fetch(`${base}api/get`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams([["@Example.Module.Settings", ""]]),
                })
            ).status,
            404,
        );
        const probe = await fetch(`${base}api/Module`, { method: "HEAD" });
        assert.equal(probe.status, 200);
        assert.equal(probe.headers.get("X-PreferencePanes-Version"), "preview");
        assert.equal(await probe.text(), "");
        assert.equal((await fetch(`${base}settings/assets/Module.css`)).status, 404);
        assert.equal((await fetch(`${base}api/Other`)).status, 404);
        assert.equal((await fetch(`${base}configs/Module`)).status, 404);
        assert.equal((await fetch(`${base}preview`, { method: "POST", body: "{" })).status, 400);
        assert.equal((await fetch(`${base}api/Module`)).status, 404);
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, "exit");
            child.kill();
            await exited;
        }
    }
});
