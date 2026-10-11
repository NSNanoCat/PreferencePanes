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

test("direct module fragments seed one root entry and recreate cleanly without growing history", () => {
    const { window, node, animations } = environment("https://example.org/settings/#Module");
    const container = node(),
        home = node();
    let navigation = new Navigation(container, home, () => node());
    assert.equal(window.history.length, 2);
    assert.equal(navigation.current, "Module");
    navigation.destroy();
    navigation = new Navigation(container, home, () => node());
    assert.equal(window.history.length, 2);
    navigation.back();
    animations.at(-1).onfinish();
    assert.equal(window.location.href, "https://example.org/settings/");
    assert.equal(navigation.current, "");
    navigation.destroy();
});

test("direct field routes seed the module parent and retain scroll by route after recreation", () => {
    const { window, node, animations } = environment("https://example.org/settings/#Module/items");
    const container = node(),
        home = node();
    const navigation = new Navigation(container, home, () => node());
    assert.equal(window.history.length, 3);
    assert.equal(navigation.current, "Module/items");
    container.children.at(-1).scrollTop = 140;
    navigation.back();
    assert.equal(navigation.current, "Module");
    animations.at(-1).onfinish();
    navigation.open("Module/items");
    assert.equal(window.location.hash, "#Module/items");
    assert.equal(container.children.at(-1).scrollTop, 140);
    navigation.refresh();
    assert.equal(window.history.length, 3);
    assert.equal(container.children.at(-1).scrollTop, 140);
    navigation.destroy();
});

test("async module reload restores scroll after its loading placeholder stops clamping the position", () => {
    const { node, animations } = environment();
    const container = node(),
        home = node();
    let detail,
        limit = 0,
        value = 0;
    const navigation = new Navigation(container, home, () => {
        if (!detail) {
            detail = node();
            Object.defineProperty(detail, "scrollTop", {
                get: () => value,
                set: next => {
                    value = Math.min(next, limit);
                },
            });
        }
        return detail;
    });
    navigation.open("Module");
    animations.at(-1).onfinish();
    limit = 500;
    navigation.refresh();
    detail.scrollTop = 230;
    navigation.back();
    animations.at(-1).onfinish();
    detail = undefined;
    value = limit = 0;
    navigation.open("Module");
    assert.equal(detail.scrollTop, 0);
    limit = 500;
    navigation.refresh();
    assert.equal(detail.scrollTop, 230);
    detail.scrollTop = 80;
    navigation.refresh();
    assert.equal(detail.scrollTop, 80);
    navigation.destroy();
});
