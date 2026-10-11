import { ActionMenu } from "./ActionMenu.mjs";
import { normalizeBoxJs } from "./boxjs.mjs";
import { element } from "./components.mjs";
import { browserHost, PageController } from "./page.mjs";
import { installDefaultStyles } from "./styles.mjs";

/**
 * 使用原始 BoxJS JSON 挂载设置页，共用内部页面控制器。
 * Mount a settings page from raw BoxJS JSON through the shared internal page controller.
 * @param {import("../index.js").BoxJSInput} boxjs 单模块 BoxJS JSON / Single-module BoxJS JSON.
 * @returns {import("./index.js").MountedPreferences} 模块视图 / Module view.
 */
export function mount(boxjs) {
    const definition = normalizeBoxJs(boxjs);
    const title = definition.metadata?.name ?? definition.module;
    const existing = document.querySelector("#preferences");
    const root = existing ?? element("main", "");
    const previousTitle = document.title;
    const previousKeyboard = document.documentElement.style.getPropertyValue("--pp-keyboard-height");
    const previousHeight = document.documentElement.style.getPropertyValue("--pp-host-height");
    const previousTheme = document.documentElement.dataset.theme;
    const previousClass = document.documentElement.classList.contains("pp-page");
    document.documentElement.classList.add("pp-page");
    root.dataset.preferencePanesPages = "";
    if (!existing) {
        root.id = "preferences";
        document.body.append(root);
    }
    const defaults = installDefaultStyles(document);
    const menu = new ActionMenu(id => page.perform(id));
    const host = browserHost({ menu, back: () => page.navigation.back() });
    const page = new PageController(root, element("main", "pp-home"), { host, menu, title, modules: new Map([[definition.module, { name: title, boxjs }]]) });
    if (!page.navigation.current) page.navigation.open(definition.module);
    let destroyed = false;
    const pagehide = event => {
        if (!event.persisted) destroy();
    };
    window.addEventListener("pagehide", pagehide);
    /**
     * 释放模块、样式与监听器，并恢复调用方的文档状态。
     * Release the module, styles and listeners and restore the caller's document state.
     * @returns {void} 无返回值 / No return value.
     */
    function destroy() {
        if (destroyed) return;
        destroyed = true;
        page.destroy();
        window.removeEventListener("pagehide", pagehide);
        if (defaults.owned) defaults.element.remove();
        if (existing) {
            root.replaceChildren();
            delete root.dataset.preferencePanesPages;
        } else root.remove();
        if (!previousClass) document.documentElement.classList.remove("pp-page");
        document.title = previousTitle;
        document.documentElement.style.setProperty("--pp-keyboard-height", previousKeyboard);
        document.documentElement.style.setProperty("--pp-host-height", previousHeight);
        if (previousTheme === undefined) delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = previousTheme;
    }
    return { destroy };
}
