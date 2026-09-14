import assert from "node:assert/strict";
import test from "node:test";
import { requestConfirmation, requestURLNavigation } from "../src/browser/components.mjs";

test("URL navigation keeps browser defaults unless an embedded host accepts ownership", () => {
    assert.equal(requestURLNavigation({ frameElement: undefined }, "https://example.org/path"), false);

    const frame = Object.assign(new EventTarget(), { ownerDocument: { defaultView: { CustomEvent } } });
    const host = { frameElement: frame };
    const urls = [];
    frame.addEventListener("preferencepanes:open-url", event => urls.push(event.detail.url));
    assert.equal(requestURLNavigation(host, "https://example.org/path"), false);
    assert.equal(requestURLNavigation(host, "bilibili://main/top_category"), false);

    frame.addEventListener("preferencepanes:open-url", event => event.preventDefault());
    assert.equal(requestURLNavigation(host, "bilibili://main/top_category"), true);
    assert.deepEqual(urls, ["https://example.org/path", "bilibili://main/top_category", "bilibili://main/top_category"]);
});

test("native notice interception suppresses the module fallback and releases its listener", t => {
    globalThis.document = { baseURI: "https://example.org/", createElement: () => Object.assign(new EventTarget(), { dataset: {} }) };
    t.after(() => {
        globalThis.document = undefined;
    });
    const frame = new ModuleFrame("/settings/Example");
    let notice;
    frame.addEventListener("notice", event => {
        notice = event.detail;
        event.preventDefault();
    });
    const detail = { kind: "success", message: "修改成功" };
    assert.equal(frame.element.dispatchEvent(new CustomEvent("preferencepanes:notice", { cancelable: true, detail })), false);
    assert.deepEqual(notice, detail);
    frame.destroy();
    assert.equal(frame.element.dispatchEvent(new CustomEvent("preferencepanes:notice", { cancelable: true, detail })), true);
});

test("host URL interception suppresses iframe navigation and releases its listener", t => {
    globalThis.document = { baseURI: "https://example.org/", createElement: () => Object.assign(new EventTarget(), { dataset: {} }) };
    t.after(() => {
        globalThis.document = undefined;
    });
    const frame = new ModuleFrame("/settings/Example");
    const detail = { url: "bilibili://main/top_category" };
    frame.addEventListener("open-url", event => {
        assert.deepEqual(event.detail, detail);
        event.preventDefault();
    });
    assert.equal(frame.element.dispatchEvent(new CustomEvent("preferencepanes:open-url", { cancelable: true, detail })), false);
    frame.destroy();
    assert.equal(frame.element.dispatchEvent(new CustomEvent("preferencepanes:open-url", { cancelable: true, detail })), true);
});

import { ModuleFrame } from "../src/browser/ModuleFrame.mjs";

test("host confirmation is asynchronous and detaches with its module frame", async t => {
    globalThis.document = { baseURI: "https://example.org/", createElement: () => Object.assign(new EventTarget(), { dataset: {}, ownerDocument: { defaultView: { CustomEvent } } }) };
    t.after(() => {
        globalThis.document = undefined;
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

test("ModuleFrame sends GET headers, preserves response HTML and exposes only the module identity", async t => {
    globalThis.document = { baseURI: "https://example.org/settings/", createElement: () => Object.assign(new EventTarget(), { dataset: {} }) };
    t.after(() => {
        globalThis.document = undefined;
    });
    const html = '<!doctype html><main id="preferences"></main>';
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(html));
    const headers = { "X-PreferencePanes-JSON": "/configs/Other.json", "X-PreferencePanes-CSS": "/theme.css" };
    const frame = new ModuleFrame("/settings/Other", { headers });
    await frame.load();
    assert.equal(frame.element.srcdoc, html);
    assert.equal(frame.element.dataset.preferencePanes, "true");
    assert.equal(frame.element.dataset.preferencePanesModule, "Other");
    assert.equal(frame.element.dataset.preferencePanesCss, undefined);
    assert.equal(fetch.mock.calls[0].arguments[0].href, "https://example.org/settings/Other");
    assert.equal(fetch.mock.calls[0].arguments[1].method, "GET");
    assert.equal(fetch.mock.calls[0].arguments[1].headers, headers);
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
        globalThis.document = undefined;
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
        globalThis.document = undefined;
    });
    const frame = new ModuleFrame("/settings/Example");
    const calls = [];
    frame.element.addEventListener("preferencepanes:action", event => calls.push(event.detail));
    frame.element.dispatchEvent(
        new CustomEvent("preferencepanes:change", {
            detail: {
                title: "Example",
                busy: false,
                actions: [
                    { id: "viewSettings", label: "查看设置" },
                    { id: "viewCaches", label: "查看缓存" },
                ],
            },
        }),
    );
    frame.perform("viewSettings");
    frame.perform("viewCaches");
    assert.throws(() => frame.perform("reset"), /not available/);
    assert.deepEqual(calls, ["viewSettings", "viewCaches"]);
    frame.destroy();
});
