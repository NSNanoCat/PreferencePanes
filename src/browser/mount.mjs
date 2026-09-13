import { normalizeBoxJs, normalizeStoredValue, validValue } from "./boxjs.mjs";
import { element, resourceURL } from "./components.mjs";
import { mountPanel } from "./panel.mjs";
import { installDefaultStyles } from "./styles.mjs";

/**
 * 挂载模块设置页；默认样式由包提供，可选 CSS 仅作用于当前模块。
 * Mount a module page with package defaults and optional module-scoped CSS.
 * @param {import("../index.js").ModuleModel} model API 返回的模块模型 / Module model returned by the API.
 * @param {string} [css] 可选 CSS 正文 / Optional module-scoped CSS text.
 * @returns {import("./index.js").MountedPreferences} 模块生命周期句柄 / Module lifecycle handle.
 */
export function mount(model, css = "") {
    if (typeof css !== "string") throw new TypeError("CSS must be a string");
    const definition = normalizeBoxJs(model.boxjs, model.module);
    const values = { ...model.values };
    for (const field of definition.fields) {
        if (values[field.key] === undefined) continue;
        values[field.key] = normalizeStoredValue(field, values[field.key]);
        if (!validValue(field, values[field.key])) throw new TypeError(`Invalid stored value: ${field.key}`);
    }
    for (const field of definition.fields) if (values[field.key] === undefined && Object.hasOwn(field, "defaultValue")) values[field.key] = structuredClone(field.defaultValue);
    const rendered = { ...model, definition, values };
    const metadata = definition.metadata ?? {};
    const image = metadata.icon || metadata.icons?.[1] || metadata.icons?.[0];
    if (image) resourceURL(image);
    if (metadata.repo) resourceURL(metadata.repo);
    const existing = document.querySelector("#preferences");
    const root = existing ?? element("main", "");
    if (!existing) {
        root.id = "preferences";
        document.body.append(root);
    }
    const { element: base, owned: ownsBase } = installDefaultStyles(document);
    const custom = element("style", "");
    custom.textContent = css;
    document.head.append(custom);
    const previousTitle = document.title;
    const previousTheme = document.documentElement.dataset.theme;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const previousKeyboard = document.documentElement.style.getPropertyValue("--pp-keyboard-height");
    const host = window.frameElement?.ownerDocument.documentElement;
    /**
     * 跟随嵌入宿主的通用环境状态，不识别业务 App 或解析其 UA。
     * Follow generic host appearance without detecting a business App or parsing its UA.
     * @returns {void} 已同步主题与键盘避让 / Theme and keyboard clearance synchronized.
     */
    const syncAppearance = () => {
        const theme = host?.dataset.theme ?? previousTheme ?? (systemTheme.matches ? "dark" : "light");
        document.documentElement.dataset.theme = theme;
        if (host) document.documentElement.style.setProperty("--pp-keyboard-height", host.style.getPropertyValue("--pp-keyboard-height"));
    };
    let observer;
    syncAppearance();
    systemTheme.addEventListener("change", syncAppearance);
    if (host) {
        observer = new MutationObserver(syncAppearance);
        observer.observe(host, { attributes: true, attributeFilter: ["data-theme", "style"] });
    }
    document.title = metadata.name ?? definition.module;
    let panel;
    const view = {
        /**
         * 释放模块视图、样式与会话，不操作项目入口页。
         * Release the module view, styles and session without operating a project landing page.
         * @returns {void} 无返回值 / No return value.
         */
        destroy() {
            observer?.disconnect();
            systemTheme.removeEventListener("change", syncAppearance);
            panel?.destroy();
            if (ownsBase) base.remove();
            custom.remove();
            if (existing) root.replaceChildren();
            else root.remove();
            document.title = previousTitle;
            if (previousTheme === undefined) delete document.documentElement.dataset.theme;
            else document.documentElement.dataset.theme = previousTheme;
            document.documentElement.style.setProperty("--pp-keyboard-height", previousKeyboard);
        },
    };
    try {
        root.replaceChildren();
        panel = mountPanel(root, rendered);
        return view;
    } catch (error) {
        view.destroy();
        throw error;
    }
}
