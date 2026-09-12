import assert from "node:assert/strict";
import test from "node:test";
import { ModuleStatus, probeModule } from "../src/browser/ModuleStatus.mjs";

test("status row uses HEAD and displays module versions or not installed", async t => {
    const element = { dataset: {}, textContent: "", title: "" };
    const status = new ModuleStatus(element);
    let response = new Response(null, { status: 200, headers: { "X-PreferencePanes-Version": "dev.abc1234" } });
    const fetch = t.mock.method(globalThis, "fetch", async () => response);
    const installed = await status.check("https://example.org/configs/Module");
    assert.deepEqual(installed, { state: "installed", version: "dev.abc1234", httpStatus: 200 });
    assert.equal(fetch.mock.calls[0].arguments[1].method, "HEAD");
    assert.equal(fetch.mock.calls[0].arguments[1].cache, "no-store");
    assert.equal(fetch.mock.calls[0].arguments[1].credentials, "omit");
    assert.equal(element.textContent, "dev.abc1234");
    assert.equal(status.state.status, "installed");
    response = new Response(null, { status: 404 });
    await status.check("https://example.org/configs/Module");
    assert.equal(element.textContent, "未安装");
    response = new Response(null, { status: 200 });
    await status.check("https://example.org/configs/Module");
    assert.equal(element.textContent, "版本未知");
    assert.equal(status.state.status, "installed");
    status.destroy();
});

test("late and cancelled probes cannot overwrite newer status", async t => {
    const element = { dataset: {} };
    const status = new ModuleStatus(element);
    const pending = [];
    t.mock.method(globalThis, "fetch", () => new Promise(resolve => pending.push(resolve)));
    const first = status.check("/configs/Module");
    const second = status.check("/configs/Module");
    pending[1](new Response(null, { status: 404 }));
    await second;
    pending[0](new Response(null, { status: 200 }));
    await first;
    assert.equal(element.textContent, "未安装");
    const last = status.check("/configs/Module");
    status.destroy();
    pending[2](new Response(null, { status: 200 }));
    await last;
    assert.equal(element.textContent, "检测中");
});

test("probeModule exposes the shared HEAD contract", async () => {
    const calls = [];
    const fetch = async (...arguments_) => {
        calls.push(arguments_);
        return new Response(null, { status: 200, headers: { "X-PreferencePanes-Version": " 0.9.15 " } });
    };
    assert.deepEqual(await probeModule("https://example.org/configs/Module", { fetch }), {
        state: "installed",
        version: "0.9.15",
        httpStatus: 200,
    });
    assert.equal(calls[0][1].method, "HEAD");
    assert.equal(calls[0][1].cache, "no-store");
    assert.equal(calls[0][1].credentials, "omit");
});

test("probeModule returns the HTTP status for unavailable modules", async () => {
    const result = await probeModule("https://example.org/configs/Module", {
        fetch: async () => new Response(null, { status: 404 }),
    });
    assert.deepEqual(result, { state: "missing", version: null, httpStatus: 404 });
});

test("probeModule maps network failures to an unavailable module", async () => {
    const result = await probeModule("https://example.org/configs/Module", {
        fetch: async () => {
            throw new TypeError("network failure");
        },
    });
    assert.deepEqual(result, { state: "missing", version: null, httpStatus: null });
});
