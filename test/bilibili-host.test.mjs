import assert from "node:assert/strict";
import test from "node:test";
import { BilibiliHost } from "../src/browser/BilibiliHost.mjs";

function environment(userAgent = "BiliApp themeId/2") {
    const channels = new Map();
    const calls = [];
    const classes = new Set();
    const document = {
        documentElement: {
            dataset: {},
            classList: { toggle: (name, enabled) => (enabled ? classes.add(name) : classes.delete(name)) },
            style: { setProperty() {} },
        },
    };
    const bridge = {
        isWbTypeCommon: true,
        initPromise: Promise.resolve(),
        addChannel: (name, callback, data) => channels.set(name, { callback, data }),
        removeChannel: name => channels.delete(name),
        useNative: async (method, data) => {
            calls.push({ method, data });
            if (method === "liveUI.selectPanel") return { data: { text: "reset" } };
        },
        callNative() {},
    };
    return { host: { biliBridge: bridge, document, navigator: { userAgent } }, bridge, document, channels, calls, classes };
}

test("Bilibili host follows the official theme marker and event", async () => {
    const fixture = environment();
    const controller = new BilibiliHost(assert.fail, fixture.host);
    assert.equal(fixture.document.documentElement.dataset.theme, "dark");
    assert.equal(fixture.classes.has("bili_dark"), true);
    await controller.ready;
    fixture.channels.get("ui.observeThemeChange").callback({ code: 0, data: { theme: 1 } });
    assert.equal(fixture.document.documentElement.dataset.theme, "light");
    controller.destroy();
});

test("Bilibili host maps module actions to the official navigation and bottom selector", async () => {
    const fixture = environment("BiliApp themeId/1");
    const selected = [];
    const controller = new BilibiliHost(id => selected.push(id), fixture.host);
    await controller.update({ title: "Enhanced", actions: [{ id: "reset", label: "重置模块" }], busy: false });
    assert.deepEqual(fixture.calls.slice(-2), [
        { method: "ui.setTitle", data: { title: "Enhanced" } },
        { method: "ui.setNavigationButton", data: { buttons: [{ id: "preference-panes.more", type: 3, visible: true }] } },
    ]);
    fixture.channels.get("ui.observeNavigationClick").callback({ code: 0, data: { id: "preference-panes.more" } });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fixture.calls.at(-1), {
        method: "liveUI.selectPanel",
        data: { title: "更多操作", options: [{ text: "重置模块", value: "reset" }] },
    });
    assert.deepEqual(selected, ["reset"]);
    controller.destroy();
});

test("Bilibili host delegates confirmations and notices to official bridge methods", async () => {
    const fixture = environment();
    let confirmation;
    fixture.bridge.callNative = request => {
        confirmation = request;
    };
    const controller = new BilibiliHost(assert.fail, fixture.host);
    const pending = controller.confirm("确定重置？");
    await new Promise(resolve => setImmediate(resolve));
    confirmation.onConfirm();
    assert.equal(await pending, true);
    await controller.notice("修改成功");
    assert.deepEqual(fixture.calls.at(-1), { method: "liveUI.toast", data: { type: "short", msg: "修改成功" } });
    controller.destroy();
});
