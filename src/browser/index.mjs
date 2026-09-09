import defaults from "#styles";
import { BoxJS } from "../BoxJS.mjs";
import { installation } from "../lib/installation.mjs";
import { createPreferencesClient } from "./client.mjs";
import { icon, element as node, resourceURL } from "./components.mjs";
import { mountPanel } from "./panel.mjs";

/**
 * 根据 BoxJS 生成整个应用，默认样式内置，自定义 CSS 最后覆盖。
 * Build the complete application from BoxJS, with built-in defaults and optional CSS applied last.
 * @param {import("../index.js").BoxJSInput} boxjs BoxJS JSON / BoxJS JSON.
 * @param {string} [css] 可选 CSS 正文 / Optional CSS text.
 * @returns {import("./index.js").MountedPreferences} 生命周期句柄 / Lifecycle handle.
 */
export function mount(boxjs, css = "") {
    if (typeof css !== "string") throw new TypeError("CSS must be a string");
    const catalog = new BoxJS(boxjs);
    for (const metadata of [catalog.metadata, ...Array.from(catalog.modules.values(), entry => entry.metadata)]) {
        const image = metadata.icon || metadata.icons?.[1] || metadata.icons?.[0];
        if (image) resourceURL(image);
        if (metadata.repo) resourceURL(metadata.repo);
    }
    const existing = document.querySelector("#preferences");
    const root = existing ?? node("main", "");
    if (!existing) {
        root.id = "preferences";
        document.body.append(root);
    }
    const base = node("style", ""),
        custom = node("style", "");
    base.textContent = defaults;
    custom.textContent = css;
    document.head.append(base, custom);
    const previousTitle = document.title;
    const theme = navigator.userAgent.match(/themeId\/(\d+)/)?.[1];
    const previousTheme = document.documentElement.dataset.theme;
    if (theme) document.documentElement.dataset.theme = theme === "2" ? "dark" : "light";
    const client = createPreferencesClient({ catalog, timeout: 3500 });
    let panel,
        revision = 0,
        routedPath,
        download;

    /**
     * 按当前 URL 挂载菜单或模块，每次回到菜单都重新探测配置 Mock。
     * Mount the menu or module from the current URL and re-probe configuration Mocks on every menu entry.
     * @returns {void} 页面已挂载 / Page mounted.
     */
    function render() {
        routedPath = location.pathname;
        const version = ++revision;
        panel?.destroy();
        panel = undefined;
        if (download) {
            URL.revokeObjectURL(download);
            download = undefined;
        }
        root.replaceChildren();
        if (/^\/settings\/[a-zA-Z0-9_-]+\/?$/.test(routedPath)) {
            panel = mountPanel(root, catalog);
            return;
        }
        document.title = catalog.metadata.name ?? "Preferences";
        const home = node("section", "pp-home");
        const brand = icon(catalog.metadata, "brand-logo");
        if (brand) home.append(brand);
        home.append(node("h1", "", document.title));
        const installer = node("details", "pp-install");
        installer.append(node("summary", "", "安装模块"));
        const platform = node("select", ""),
            target = node("select", "");
        platform.setAttribute("aria-label", "代理工具");
        target.setAttribute("aria-label", "安装内容");
        for (const [value, name] of [
            ["surge", "Surge"],
            ["loon", "Loon"],
            ["quantumult", "Quantumult X"],
            ["stash", "Stash"],
            ["shadowrocket", "Shadowrocket"],
        ]) {
            const option = node("option", "", name);
            option.value = value;
            platform.append(option);
        }
        const core = node("option", "", "PreferencePanes");
        core.value = "";
        target.append(core);
        for (const module of catalog.modules.keys()) {
            const option = node("option", "", `${module} BoxJS Mock`);
            option.value = module;
            target.append(option);
        }
        const save = node("button", "", "下载");
        save.type = "button";
        save.onclick = () => {
            const result = installation(platform.value, new URL(location.href), target.value || undefined);
            if (download) URL.revokeObjectURL(download);
            download = URL.createObjectURL(new Blob([result.text], { type: "text/plain" }));
            const link = node("a", "");
            link.href = download;
            link.download = `${target.value || "PreferencePanes"}.${result.extension}`;
            link.click();
        };
        installer.append(platform, target, save);
        home.append(installer);
        const section = node("section", "self-panel is-zh");
        section.append(node("h2", "header", "模块"));
        const container = node("div", "container"),
            scrollView = node("div", "scroll-view"),
            rows = node("div", "scroll");
        scrollView.append(rows);
        container.append(scrollView);
        section.append(container);
        home.append(section);
        for (const description of [catalog.metadata.desc ?? catalog.metadata.description, ...(catalog.metadata.descs ?? [])]) if (description) home.append(node("p", "settings-note", description));
        root.append(home);
        for (const { module, metadata } of catalog.modules.values()) {
            const button = node("button", "self-item is-zh"),
                status = node("span", "module-status", "检测中");
            button.type = "button";
            button.disabled = true;
            button.dataset.module = module;
            const picture = node("span", "logo"),
                image = icon(metadata, "");
            picture.append(image ?? node("span", "pp-initial", module[0]));
            button.append(picture, node("span", "name", metadata.name ?? module), status);
            rows.append(button);
            button.onclick = () => {
                history.pushState(null, "", `/settings/${encodeURIComponent(module)}`);
                render();
                if (!matchMedia("(prefers-reduced-motion: reduce)").matches) root.animate([{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], { duration: 260, easing: "ease-out" });
            };
            client.probe(module).then(available => {
                if (revision !== version) return;
                button.disabled = !available;
                status.textContent = available ? "" : "未响应";
            });
        }
    }
    const popstate = () => {
        if (routedPath === location.pathname) return;
        render();
        if (location.pathname === "/settings/" && !matchMedia("(prefers-reduced-motion: reduce)").matches) root.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }], { duration: 260, easing: "ease-out" });
    };
    const pageshow = event => {
        if (event.persisted && location.pathname === "/settings/") render();
    };
    window.addEventListener("popstate", popstate);
    window.addEventListener("pageshow", pageshow);
    const application = {
        /**
         * 移除整个应用及其监听器、样式和下载资源。
         * Remove the complete application, listeners, styles and download resources.
         * @returns {void} 无返回值 / No return value.
         */
        destroy() {
            revision++;
            panel?.destroy();
            window.removeEventListener("popstate", popstate);
            window.removeEventListener("pageshow", pageshow);
            if (download) URL.revokeObjectURL(download);
            base.remove();
            custom.remove();
            if (existing) root.replaceChildren();
            else root.remove();
            document.title = previousTitle;
            if (previousTheme === undefined) delete document.documentElement.dataset.theme;
            else document.documentElement.dataset.theme = previousTheme;
        },
    };
    try {
        render();
        return application;
    } catch (error) {
        application.destroy();
        throw error;
    }
}
