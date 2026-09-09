import assert from "node:assert/strict";
import test from "node:test";
import { requestConfirmation } from "../src/browser/components.mjs";
import { ModuleFrame } from "../src/browser/ModuleFrame.mjs";

test("host confirmation is asynchronous and detaches with its module frame", async t => {
    globalThis.document = { baseURI: "https://example.org/", createElement: () => Object.assign(new EventTarget(), { dataset: {}, ownerDocument: { defaultView: { CustomEvent } } }) };
    t.after(() => {
        delete globalThis.document;
    });
    const frame = new ModuleFrame("/settings/Example");
    frame.addEventListener("confirm", event => {
        event.preventDefault();
        event.detail.resolve(false);
    });
    const host = { frameElement: frame.element, confirm: () => assert.fail("Host owns the dialog") };
    assert.equal(await requestConfirmation(host, "Reset?"), false);
    frame.destroy();
    host.confirm = () => true;
    assert.equal(await requestConfirmation(host, "Standalone?"), true);
});

test("ModuleFrame preserves response HTML and passes dynamic URL/header inputs outside the document", async t => {
    globalThis.document = { baseURI: "https://example.org/settings/", createElement: () => Object.assign(new EventTarget(), { dataset: {} }) };
    t.after(() => {
        delete globalThis.document;
    });
    const html = '<!doctype html><main id="preferences"></main>';
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(html));
    const frame = new ModuleFrame("/settings/Other?json=/query.json", { headers: { "X-PreferencePanes-JSON": "/configs/Other", "X-PreferencePanes-CSS": "/theme.css" } });
    await frame.load();
    assert.equal(frame.element.srcdoc, html);
    assert.deepEqual(JSON.parse(frame.element.dataset.preferencePanes), {
        url: "https://example.org/settings/Other?json=/query.json",
        module: "Other",
        json: "/configs/Other",
        css: "/theme.css",
    });
    assert.equal(fetch.mock.calls[0].arguments[1].headers.get("X-PreferencePanes-JSON"), "/configs/Other");
    frame.destroy();
});

test("ModuleFrame cancels late HTML and releases navigation state subscriptions", async t => {
    let back = 0;
    globalThis.document = {
        baseURI: "https://example.org/",
        createElement: () =>
            Object.assign(new EventTarget(), {
                dataset: {},
                contentWindow: {
                    history: {
                        back() {
                            back++;
                        },
                    },
                },
            }),
    };
    t.after(() => {
        delete globalThis.document;
    });
    let finish;
    t.mock.method(
        globalThis,
        "fetch",
        () =>
            new Promise(resolve => {
                finish = resolve;
            }),
    );
    const controller = new AbortController();
    const frame = new ModuleFrame("/settings/Example", { signal: controller.signal });
    frame.element.dispatchEvent(new CustomEvent("preferencepanes:change", { detail: { title: "选项", module: "Example", busy: true, canGoBack: false } }));
    assert.deepEqual(frame.state.actions, []);
    assert.throws(() => frame.perform("reset"), /not available/);
    frame.back();
    assert.equal(back, 0);
    const loading = frame.load();
    controller.abort();
    finish(new Response("late HTML"));
    await assert.rejects(loading, { name: "AbortError" });
    assert.equal(frame.element.srcdoc, undefined);
    frame.element.dispatchEvent(new CustomEvent("preferencepanes:change", { detail: { title: "stale" } }));
    assert.equal(frame.state.title, "选项");
});

test("ModuleFrame forwards only advertised idle actions", t => {
    globalThis.document = { baseURI: "https://example.org/", createElement: () => Object.assign(new EventTarget(), { dataset: {} }) };
    t.after(() => {
        delete globalThis.document;
    });
    const frame = new ModuleFrame("/settings/Example");
    const calls = [];
    frame.element.addEventListener("preferencepanes:action", event => calls.push(event.detail));
    frame.element.dispatchEvent(new CustomEvent("preferencepanes:change", { detail: { title: "Example", busy: false, actions: [{ id: "viewCaches", label: "查看缓存" }] } }));
    frame.perform("viewCaches");
    assert.throws(() => frame.perform("reset"), /not available/);
    assert.deepEqual(calls, ["viewCaches"]);
    frame.destroy();
});
