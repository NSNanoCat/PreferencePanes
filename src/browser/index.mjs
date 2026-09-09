import defaults from "#styles";
import { BoxJS } from "../BoxJS.mjs";
import { element, resourceURL } from "./components.mjs";
import { mountPanel } from "./panel.mjs";

/**
 * 只挂载导入 JSON 对应的模块设置页，默认样式内置，CSS 仅用于该页。
 * Mount only the imported module's settings page with built-in defaults and optional page CSS.
 * @param {import("../index.js").BoxJSInput} boxjs 单个模块的 BoxJS JSON / BoxJS JSON for one module.
 * @param {string} [css] 可选 CSS 正文 / Optional CSS text.
 * @returns {import("./index.js").MountedPreferences} 模块生命周期句柄 / Module lifecycle handle.
 */
export function mount(boxjs, css = "") {
    if (typeof css !== "string") throw new TypeError("CSS must be a string");
    const catalog = new BoxJS(boxjs);
    const metadata = catalog.module.metadata;
    const image = metadata.icon || metadata.icons?.[1] || metadata.icons?.[0];
    if (image) resourceURL(image);
    if (metadata.repo) resourceURL(metadata.repo);
    const existing = document.querySelector("#preferences");
    const root = existing ?? element("main", "");
    if (!existing) {
        root.id = "preferences";
        document.body.append(root);
    }
    const base = element("style", ""),
        custom = element("style", "");
    base.textContent = defaults;
    custom.textContent = css;
    document.head.append(base, custom);
    const previousTitle = document.title;
    const previousTheme = document.documentElement.dataset.theme;
    const theme = navigator.userAgent.match(/themeId\/(\d+)/)?.[1];
    if (theme) document.documentElement.dataset.theme = theme === "2" ? "dark" : "light";
    document.title = metadata.name ?? catalog.module.module;
    let panel;
    const view = {
        /**
         * 释放模块视图、样式与会话，不操作项目入口页。
         * Release the module view, styles and session without operating a project landing page.
         * @returns {void} 无返回值 / No return value.
         */
        destroy() {
            panel?.destroy();
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
        root.replaceChildren();
        panel = mountPanel(root, catalog);
        return view;
    } catch (error) {
        view.destroy();
        throw error;
    }
}
