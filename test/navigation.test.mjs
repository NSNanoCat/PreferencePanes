import assert from "node:assert/strict";
import test from "node:test";
import { Navigation } from "../src/browser/Navigation.mjs";

/**
 * 提供可控制动画完成与历史事件的 DOM 边界，验证竞态而非真实渲染。
 * Control animation completion and history at the DOM boundary to exercise races, not rendering.
 * @param {string} [href] 初始地址 / Initial URL.
 * @returns {object} 测试窗口、节点工厂与动画 / Test window, node factory and animations.
 */
function environment(href = "https://example.org/settings/") {
    const window = new EventTarget();
    window.location = new URL(href);
    const entries = [{ url: href, state: null }];
    let index = 0;
    window.history = {
        get length() {
            return entries.length;
        },
        get state() {
            return entries[index].state;
        },
        pushState(state, _, url) {
            entries.splice(++index, entries.length, { url, state });
            window.location = new URL(url);
        },
        replaceState(state, _, url) {
            entries[index] = { url, state };
            window.location = new URL(url);
        },
        back() {
            index--;
            window.location = new URL(entries[index].url);
            window.dispatchEvent(new Event("popstate"));
        },
        forward() {
            index++;
            window.location = new URL(entries[index].url);
            window.dispatchEvent(new Event("popstate"));
        },
    };
    window.matchMedia = () => ({ matches: false });
    window.getComputedStyle = () => ({ transform: "translateX(20px)" });
    const animations = [];
    const node = () => ({
        ownerDocument: { defaultView: window },
        children: [],
        scrollTop: 0,
        parent: null,
        remove() {
            if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
            this.parent = null;
        },
        append(child) {
            child.remove();
            this.children.push(child);
            child.parent = this;
        },
        replaceChildren(child) {
            for (const previous of [...this.children]) previous.remove();
            this.append(child);
        },
        animate() {
            const animation = {
                cancelled: false,
                cancel() {
                    this.cancelled = true;
                },
            };
            animations.push(animation);
            return animation;
        },
    });
    return { window, node, animations };
}

test("navigation retains home and scroll, aborts leaving loads and releases only after slide completion", () => {
    const { window, node, animations } = environment();
    const container = node(),
        home = node(),
        detail = node();
    const signals = [];
    const navigation = new Navigation(container, home, (_, signal) => {
        signals.push(signal);
        return detail;
    });
    home.scrollTop = 83;
    navigation.open("detail");
    window.dispatchEvent(new Event("hashchange"));
    assert.equal(signals.length, 1);
    assert.deepEqual(container.children, [home, detail]);
    assert.equal(home.inert, true);
    animations.at(-1).onfinish();
    detail.scrollTop = 120;
    navigation.back();
    const leaving = animations.at(-1);
    assert.equal(signals[0].aborted, true);
    assert.deepEqual(container.children, [home, detail]);
    assert.equal(home.scrollTop, 83);
    window.history.forward();
    leaving.onfinish();
    assert.deepEqual(container.children, [home, detail]);
    assert.equal(detail.scrollTop, 120);
    animations.at(-1).onfinish();
    navigation.back();
    animations.at(-1).onfinish();
    assert.deepEqual(container.children, [home]);
    navigation.destroy();
    window.history.forward();
    assert.deepEqual(container.children, []);
    assert.equal(signals.length, 2);
});

test("direct srcdoc fragments seed one root entry and recreate cleanly without growing history", () => {
    const { window, node, animations } = environment("about:srcdoc#field");
    const container = node(),
        home = node();
    let navigation = new Navigation(container, home, () => node());
    assert.equal(window.history.length, 2);
    assert.equal(navigation.current, "field");
    navigation.destroy();
    navigation = new Navigation(container, home, () => node());
    assert.equal(window.history.length, 2);
    navigation.back();
    animations.at(-1).onfinish();
    assert.equal(window.location.href, "about:srcdoc");
    assert.equal(navigation.current, "");
    navigation.destroy();
});
