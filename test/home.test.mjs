import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function fixture(override, { cssFailure = false, jsonStatus = 200, cssStatus = cssFailure ? 200 : 404, bridgeStatus = override ? 200 : 404, probeFailure } = {}) {
    class Element extends EventTarget {
        tagName = "SPAN";
        attributes = new Map();
        children = [];
        dataset = {};
        style = {
            values: new Map(),
            setProperty(k, v) {
                this.values.set(k, v);
            },
            removeProperty(k) {
                this.values.delete(k);
            },
        };
        append(...nodes) {
            for (const node of nodes) {
                node.remove();
                node.parent = this;
                this.children.push(node);
                if (node.tagName === "LINK") queueMicrotask(() => (cssFailure ? node.onerror?.() : node.onload?.()));
            }
        }
        prepend(node) {
            node.parent = this;
            this.children.unshift(node);
        }
        insertBefore(node, before) {
            node.remove();
            node.parent = this;
            this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, node);
        }
        remove() {
            if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
        }
        setAttribute(name, value) {
            this.attributes.set(name, value);
        }
        replaceChildren(...nodes) {
            for (const child of [...this.children]) child.remove();
            this.append(...nodes);
        }
        querySelectorAll(selector) {
            const nodes = this.children.flatMap(node => [node, ...node.querySelectorAll(selector)]);
            return nodes.filter(node =>
                selector === "[data-module]"
                    ? "module" in node.dataset
                    : selector === "a[href]"
                      ? node.tagName === "A" && node.href
                      : selector === "#build-info"
                        ? node.id === "build-info"
                        : selector === "[data-module-status]"
                          ? "moduleStatus" in node.dataset
                          : selector === "[data-module-message]"
                            ? "moduleMessage" in node.dataset
                            : selector === ".pp-home-name"
                              ? node.className === "pp-home-name"
                              : false,
            );
        }
        getBoundingClientRect() {
            return { height: 44 };
        }
        querySelector(selector) {
            return this.querySelectorAll(selector)[0];
        }
        cloneNode() {
            const clone = new Element();
            clone.dataset = { ...this.dataset };
            clone.append(...this.children.map(child => child.cloneNode()));
            return clone;
        }
    }
    const theme = Object.assign(new EventTarget(), { matches: false });
    const window = Object.assign(new EventTarget(), {
        matchMedia: () => theme,
        innerHeight: 800,
        visualViewport: Object.assign(new EventTarget(), { scale: 1, height: 500, offsetTop: 0 }),
        location: { assign: url => urls.push(url) },
        open: (url, target, features) => opened.push({ url, target, features }),
        confirm: () => false,
    });
    const home = new Element();
    const container = new Element();
    const page = new Element();
    const message = new Element();
    message.dataset.moduleMessage = "";
    page.append(message);
    const template = { content: { firstElementChild: page } };
    const root = new Element();
    const document = {
        baseURI: "https://example.test/settings/",
        title: "Example",
        documentElement: root,
        body: new Element(),
        head: new Element(),
        createElement(tag) {
            const element = new Element();
            element.tagName = tag.toUpperCase();
            element.ownerDocument = document;
            return element;
        },
        querySelectorAll: () => [],
        querySelector: selector => ({ "[data-preference-panes-pages]": container, "[data-preference-panes-home]": home, "template[data-preference-panes-module]": template })[selector],
    };
    home.ownerDocument = document;
    document.head.querySelector = selector => document.head.children.find(node => (selector.startsWith("style") ? "preferencePanesDefaults" in node.dataset : node.tagName === "LINK"));
    const menus = [];
    const frames = [];
    const urls = [];
    const opened = [];
    let navigation;
    class ActionMenu {
        element = new Element();
        constructor() {
            menus.push(this);
            document.body.append(new Element());
        }
        update(actions, busy) {
            this.actions = actions;
            this.busy = busy;
        }
        destroy() {
            this.destroyed = true;
            this.element.remove();
        }
    }
    class Navigation extends EventTarget {
        current = "";
        get canGoBack() {
            return Boolean(this.current);
        }
        constructor(_container, _home, create) {
            super();
            this.create = create;
            navigation = this;
        }
        open(key) {
            this.abort?.abort();
            this.abort = new AbortController();
            this.current = key;
            this.view = this.create(key, this.abort.signal);
            this.dispatchEvent(new Event("change"));
        }
        back() {
            this.backs = (this.backs ?? 0) + 1;
            this.abort?.abort();
            this.current = "";
            this.view = undefined;
            this.dispatchEvent(new Event("change"));
        }
        destroy() {
            this.abort?.abort();
            this.destroyed = true;
        }
    }
    class ModuleFrame extends EventTarget {
        element = new Element();
        state = { title: "Module", actions: [{ id: "reset", label: "重置" }], busy: false, canGoBack: true };
        constructor(url, options) {
            super();
            this.url = url;
            this.headers = options.headers;
            this.signal = options.signal;
            frames.push(this);
        }
        load() {
            return Promise.resolve();
        }
        back() {
            this.backs = (this.backs ?? 0) + 1;
        }
        perform(id) {
            this.action = id;
        }
    }
    class ModuleStatus extends EventTarget {
        state = { status: "installed" };
        check() {
            this.dispatchEvent(new Event("change"));
        }
        destroy() {}
    }
    const config = { title: "Example", sections: [{ title: "插件", items: [{ name: "Module", icon: { text: "⚙️" }, module: "Module" }] }] };
    const requests = [];
    const fetch = async (url, options) => {
        requests.push({ url: String(url), method: options.method ?? "GET", signal: options.signal });
        const name = new URL(url).pathname.split("/").at(-1);
        if (name === probeFailure) throw new Error("Network probe failed");
        const status = name === "theme.css" ? cssStatus : name === "bridge.mjs" ? bridgeStatus : jsonStatus;
        return { ok: status === 200, status, json: async () => config };
    };
    const descriptors = new Map();
    for (const [name, value] of Object.entries({ document, window, fetch, __hostClasses: { ActionMenu, Navigation, ModuleFrame, ModuleStatus }, __homeModuleURL: override })) {
        descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const stylesSource = (await readFile(new URL("../src/browser/styles.mjs", import.meta.url), "utf8")).replace('import defaults from "#styles";', 'const defaults = "default styles";');
    const stylesURL = `data:text/javascript;base64,${Buffer.from(stylesSource).toString("base64")}`;
    const source = (await readFile(new URL("../src/browser/home.mjs", import.meta.url), "utf8"))
        .replace('from "./styles.mjs"', `from "${stylesURL}"`)
        .replace("import(bridgeURL.href)", "import(globalThis.__homeModuleURL)")
        .replace(/import \{ ActionMenu, ModuleFrame, ModuleStatus, Navigation \} from .*?;/, "const { ActionMenu, ModuleFrame, ModuleStatus, Navigation } = globalThis.__hostClasses;");
    const { startHome } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${Math.random()}`);
    return {
        start: startHome,
        config,
        requests,
        home,
        document,
        window,
        root,
        theme,
        menus,
        frames,
        urls,
        opened,
        get button() {
            return home.querySelectorAll("[data-module]")[0];
        },
        get navigation() {
            return navigation;
        },
        restore() {
            for (const [name, descriptor] of descriptors) {
                if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                else delete globalThis[name];
            }
            delete globalThis.__hostOverride;
        },
    };
}

test("host installs shared defaults before optional CSS and only removes styles it owns", async () => {
    for (const existing of [false, true]) {
        const page = await fixture(undefined, { cssStatus: 200 });
        try {
            const override = page.document.createElement("link");
            override.tagName = "LINK";
            page.document.head.append(override);
            let defaults;
            if (existing) {
                defaults = page.document.createElement("style");
                defaults.dataset.preferencePanesDefaults = "";
                page.document.head.insertBefore(defaults, override);
            }
            const destroy = await page.start();
            const installed = page.document.head.children.filter(node => "preferencePanesDefaults" in node.dataset);
            assert.equal(installed.length, 1);
            assert.deepEqual(
                page.document.head.children.filter(node => node.tagName === "STYLE"),
                installed,
            );
            const stylesheet = page.document.head.children.find(node => "preferencePanesStylesheet" in node.dataset);
            assert.ok(page.document.head.children.indexOf(installed[0]) < page.document.head.children.indexOf(stylesheet));
            assert.ok(page.document.head.children.indexOf(installed[0]) < page.document.head.children.indexOf(override));
            if (existing) assert.equal(installed[0], defaults);
            destroy();
            assert.deepEqual(page.document.head.children, existing ? [defaults, override] : [override]);
        } finally {
            page.restore();
        }
    }
});

test("independent panel entries keep their configuration endpoint while using the shared storage module", async t => {
    const page = await fixture();
    page.config.sections[0].items[0].module = "API_Translate";
    page.config.sections[0].items[0].pageModule = "API";
    const destroy = await page.start();
    t.after(() => {
        destroy();
        page.restore();
    });
    page.navigation.open("API_Translate");
    assert.equal(page.frames[0].url, "/settings/API");
    assert.equal(page.frames[0].headers["X-PreferencePanes-JSON"], "/api/API_Translate");
});

test("default browser host renders once and forwards back, theme, notices and confirmation cancellation", async () => {
    const f = await fixture();
    try {
        const destroy = await f.start();
        assert.equal(f.document.body.children.filter(node => node.className === "pp-host-header").length, 1);
        assert.equal(f.root.dataset.theme, "light");
        f.theme.matches = true;
        f.theme.dispatchEvent(new Event("change"));
        assert.equal(f.root.dataset.theme, "dark");
        assert.equal(f.root.style.values.get("--pp-keyboard-height"), "300px");
        f.navigation.open("Module");
        const frame = f.frames[0];
        const header = f.document.body.children.find(node => node.className === "pp-host-header");
        header.children[0].onclick();
        assert.equal(frame.backs, 1);
        let confirmed;
        frame.dispatchEvent(
            new CustomEvent("confirm", {
                cancelable: true,
                detail: {
                    message: "重置？",
                    resolve: value => {
                        confirmed = value;
                    },
                    reject: assert.fail,
                },
            }),
        );
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(confirmed, false);
        frame.dispatchEvent(new CustomEvent("notice", { cancelable: true, detail: { kind: "success", message: "已保存" } }));
        assert.equal(f.document.body.children.find(node => node.className === "pp-host-toast").textContent, "已保存");
        f.window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
        assert.equal(f.navigation.destroyed, undefined);
        destroy();
        f.theme.matches = false;
        f.theme.dispatchEvent(new Event("change"));
        assert.equal(f.root.dataset.theme, undefined);
        assert.equal(f.menus[0].destroyed, true);
        assert.equal(
            f.document.body.children.some(node => node.className === "pp-host-header" || node.className === "pp-host-toast"),
            false,
        );
    } finally {
        f.restore();
    }
});

test("override initialization precedes navigation and late confirmation is discarded after departure", async () => {
    const module = "data:text/javascript," + encodeURIComponent("export default async options => { globalThis.__hostOverride.options = options; await globalThis.__hostOverride.ready; return globalThis.__hostOverride.host; }");
    const f = await fixture(module);
    let initialize;
    let confirm;
    let destroyed = 0;
    globalThis.__hostOverride = {
        ready: new Promise(resolve => {
            initialize = resolve;
        }),
        host: {
            update() {},
            notice() {},
            openURL() {},
            confirm: () =>
                new Promise(resolve => {
                    confirm = resolve;
                }),
            destroy: () => {
                destroyed++;
            },
        },
    };
    try {
        const started = f.start();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.navigation, undefined);
        initialize();
        const destroy = await started;
        assert.equal(
            f.document.body.children.some(node => node.className === "pp-host-header" || node.className === "pp-host-toast"),
            false,
        );
        f.navigation.open("Module");
        let resolved = false;
        f.frames[0].dispatchEvent(
            new CustomEvent("confirm", {
                cancelable: true,
                detail: {
                    message: "重置？",
                    resolve: () => {
                        resolved = true;
                    },
                    reject: assert.fail,
                },
            }),
        );
        await new Promise(resolve => setImmediate(resolve));
        destroy();
        confirm(true);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(resolved, false);
        assert.equal(destroyed, 1);
    } finally {
        f.restore();
    }
});

test("configured override load and initialization failures display an error without browser fallback", async () => {
    for (const source of ['throw new Error("load failed")', 'export default () => { throw new Error("init failed") }']) {
        const f = await fixture("data:text/javascript," + encodeURIComponent(source));
        try {
            await assert.rejects(f.start(), /failed/);
            assert.equal(f.navigation, undefined);
            assert.match(f.document.body.children.find(node => node.className === "pp-host-error").textContent, /failed/);
            assert.equal(
                f.document.body.children.some(node => node.className === "pp-host-header" || node.className === "pp-host-toast"),
                false,
            );
            assert.ok(f.menus.every(menu => menu.destroyed));
        } finally {
            f.restore();
        }
    }
});

test("departure during asynchronous initialization releases the late host without mounting navigation", async () => {
    const f = await fixture("data:text/javascript," + encodeURIComponent("export default async () => { await globalThis.__hostOverride.ready; return globalThis.__hostOverride.host; }"));
    let initialize;
    let destroyed = 0;
    globalThis.__hostOverride = {
        ready: new Promise(resolve => {
            initialize = resolve;
        }),
        host: {
            destroy: () => {
                destroyed++;
            },
        },
    };
    try {
        const started = f.start();
        await new Promise(resolve => setImmediate(resolve));
        f.window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
        initialize();
        await started;
        assert.equal(f.navigation, undefined);
        assert.equal(destroyed, 1);
        assert.equal(f.menus[0].destroyed, true);
    } finally {
        f.restore();
    }
});

test("JSON generates mixed sections, resolves assets and links against its URL and renders text literally", async t => {
    const f = await fixture();
    f.config.title = "<b>Example</b>";
    f.config.logo = "assets/logo.png";
    f.config.footer = ["<script>footer</script>"];
    f.config.sections[0].items[0].icon = { src: "assets/module.png" };
    f.config.sections.push({ title: "帮助", layout: "list", items: [{ name: "<b>官网</b>", icon: { text: "🏠" }, description: "使用说明", href: "../guide/" }] });
    const destroy = await f.start();
    t.after(() => {
        destroy();
        f.restore();
    });
    assert.equal(f.document.title, "<b>Example</b>");
    assert.equal(f.home.children[0].src, "https://example.test/settings/assets/logo.png");
    const grid = f.home.children[1].children[1];
    const list = f.home.children[2].children[1];
    assert.equal(grid.dataset.layout, "grid");
    assert.equal(list.dataset.layout, "list");
    assert.equal(f.button.children[0].children[0].src, "https://example.test/settings/assets/module.png");
    assert.equal(list.children[0].children[1].children[0].textContent, "<b>官网</b>");
    assert.equal(f.home.children.at(-1).children[0].textContent, "<script>footer</script>");
    assert.equal(f.home.children.at(-1).children.length, 1);
    const link = f.home.querySelectorAll("a[href]")[0];
    const modified = Object.assign(new Event("click", { cancelable: true }), { button: 0, metaKey: true });
    link.dispatchEvent(modified);
    assert.equal(modified.defaultPrevented, false);
    const click = Object.assign(new Event("click", { cancelable: true }), { button: 0 });
    link.dispatchEvent(click);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(click.defaultPrevented, true);
    assert.deepEqual(f.urls, ["https://example.test/guide/"]);
    destroy();
    link.dispatchEvent(Object.assign(new Event("click"), { button: 0 }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.urls.length, 1);
});

test("link targets keep internal navigation and open new tabs synchronously without replacing settings", async t => {
    const f = await fixture();
    f.config.sections.push({
        title: "项目链接",
        layout: "list",
        items: [
            { name: "官网", icon: { text: "🏠" }, href: "../", target: "internal" },
            { name: "组织", icon: { text: "🐙" }, href: "https://github.com/Example", target: "_blank" },
            { name: "当前页", icon: { text: "↗" }, href: "../guide/", target: "_self" },
        ],
    });
    const destroy = await f.start();
    t.after(() => {
        destroy();
        f.restore();
    });
    const [internal, blank, self] = f.home.querySelectorAll("a[href]");
    f.navigation.open("Module");
    f.navigation.back();
    internal.dispatchEvent(Object.assign(new Event("click", { cancelable: true }), { button: 0 }));
    const header = f.document.body.children.find(node => node.className === "pp-host-header");
    const iframe = f.navigation.view.children[0];
    assert.equal(iframe.tagName, "IFRAME");
    assert.equal(iframe.src, "https://example.test/");
    assert.ok(!iframe.attributes.get("sandbox").includes("allow-top-navigation"));
    assert.equal(header.children[1].textContent, "官网");
    assert.equal(header.children[0].hidden, false);
    assert.deepEqual(f.menus[0].actions, []);
    header.children[0].onclick();
    assert.equal(f.navigation.current, "");
    assert.equal(f.frames[0].backs, undefined);
    assert.equal(header.children[1].textContent, "Example");
    blank.dispatchEvent(Object.assign(new Event("click", { cancelable: true }), { button: 0 }));
    assert.deepEqual(f.opened, [{ url: "https://github.com/Example", target: "_blank", features: "noopener,noreferrer" }]);
    assert.deepEqual(f.urls, []);
    assert.equal(f.navigation.current, "");
    self.dispatchEvent(Object.assign(new Event("click", { cancelable: true }), { button: 0 }));
    assert.deepEqual(f.urls, ["https://example.test/guide/"]);
});

test("missing Bridge never accesses a native SDK and project CSS follows defaults and reaches module frames", async t => {
    const f = await fixture(undefined, { cssStatus: 200 });
    Object.defineProperty(f.window, "biliBridge", { get: () => assert.fail("An undeclared Bridge must not be accessed") });
    const destroy = await f.start();
    t.after(() => {
        destroy();
        f.restore();
    });
    assert.deepEqual(
        f.requests.map(request => request.url),
        ["https://example.test/settings/home.json", "https://example.test/settings/theme.css", "https://example.test/settings/bridge.mjs"],
    );
    const sheet = f.document.head.children.find(node => node.tagName === "LINK");
    assert.equal(sheet.href, "https://example.test/settings/theme.css");
    assert.equal(f.document.head.children.at(-1), sheet);
    assert.equal(
        f.document.head.children.some(node => node.tagName === "SCRIPT"),
        false,
    );
    f.navigation.open("Module");
    assert.equal(f.frames[0].headers["X-PreferencePanes-CSS"], sheet.href);
    destroy();
    assert.equal(f.requests[0].signal.aborted, true);
    assert.equal(f.document.head.children.length, 0);
});

test("required JSON and available CSS failures stop initialization and display the cause", async () => {
    for (const options of [{ jsonStatus: 404 }, { cssFailure: true }]) {
        const f = await fixture(undefined, options);
        try {
            await assert.rejects(f.start(), /加载失败/);
            assert.equal(f.navigation, undefined);
            assert.match(f.document.body.children.find(node => node.className === "pp-host-error").textContent, /加载失败/);
            assert.equal(f.document.head.children.length, 0);
        } finally {
            f.restore();
        }
    }
});

test("invalid external JSON rejects ambiguous navigation, duplicate modules and executable links before navigation starts", async () => {
    const item = { name: "Module", icon: { text: "⚙️" }, module: "Module" };
    for (const config of [
        { title: "Example", sections: [{ title: "插件", layout: "unknown", items: [item] }] },
        { title: "Example", sections: [{ title: "插件", items: [item, item] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ ...item, href: "/guide/" }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ ...item, module: 123, href: "/guide/" }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ ...item, module: undefined, href: "javascript:alert(1)" }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ ...item, module: undefined, href: "java\nscript:alert(1)" }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ ...item, pageModule: 123 }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ ...item, icon: { text: "⚙️", src: 123 } }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ ...item, icon: { text: "⚙️", src: "icon.png" } }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ ...item, target: "internal" }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ name: "链接", icon: { text: "↗" }, href: "/", target: "unknown" }] }] },
        { title: "Example", sections: [{ title: "插件", items: [{ name: "链接", icon: { text: "↗" }, href: "mailto:example@example.com", target: "internal" }] }] },
    ]) {
        const f = await fixture();
        try {
            Object.assign(f.config, config);
            await assert.rejects(f.start());
            assert.equal(f.navigation, undefined);
            assert.equal(f.home.querySelectorAll("[data-module]").length, 0);
        } finally {
            f.restore();
        }
    }
});

test("fixed optional paths accept only missing resources as defaults and reject HTTP and network failures", async () => {
    const defaultPage = await fixture();
    try {
        const destroy = await defaultPage.start();
        assert.deepEqual(
            defaultPage.requests.map(({ url, method }) => [url, method]),
            [
                ["https://example.test/settings/home.json", "GET"],
                ["https://example.test/settings/theme.css", "HEAD"],
                ["https://example.test/settings/bridge.mjs", "HEAD"],
            ],
        );
        assert.equal(
            defaultPage.document.head.children.some(node => node.tagName === "LINK" || node.tagName === "SCRIPT"),
            false,
        );
        assert.equal(defaultPage.document.body.children.filter(node => node.className === "pp-host-header").length, 1);
        destroy();
    } finally {
        defaultPage.restore();
    }
    for (const options of [{ cssStatus: 500 }, { cssStatus: 204 }, { bridgeStatus: 503 }, { bridgeStatus: 403 }, { probeFailure: "theme.css" }, { probeFailure: "bridge.mjs" }]) {
        const f = await fixture(undefined, options);
        try {
            await assert.rejects(f.start(), /探测失败|Network probe failed/);
            assert.equal(f.navigation, undefined);
            assert.equal(f.menus.length, 0);
            assert.match(f.document.body.children.find(node => node.className === "pp-host-error").textContent, /探测失败|Network probe failed/);
        } finally {
            f.restore();
        }
    }
});
