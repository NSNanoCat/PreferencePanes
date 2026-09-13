import { normalizeBoxJs, normalizeStoredValue, validValue } from "./boxjs.mjs";
import { element, resourceURL } from "./components.mjs";
import { PreferencesPanel } from "./panel.mjs";
import { installDefaultStyles } from "./styles.mjs";

/**
 * 管理模块设置视图的模型规范化、样式、主题同步和面板生命周期。
 * Manage model normalization, styles, theme synchronization, and panel lifecycle for a module settings view.
 */
export class PreferencesView {
    #existing;
    #root;
    #base;
    #ownsBase;
    #custom;
    #previousTitle;
    #previousTheme;
    #systemTheme;
    #previousKeyboard;
    #host;
    #observer;
    #panel;

    /**
     * 使用模块 API 返回的模型挂载设置页。
     * Mount a settings page from the model returned by the module API.
     * @param {import("../index.js").ModuleModel} model API 返回的模块模型 / Module model returned by the API.
     * @param {string} [css] 可选 CSS 正文 / Optional module-scoped CSS text.
     */
    constructor(model, css = "") {
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

        this.#existing = document.querySelector("#preferences");
        this.#root = this.#existing ?? element("main", "");
        if (!this.#existing) {
            this.#root.id = "preferences";
            document.body.append(this.#root);
        }
        const styles = installDefaultStyles(document);
        this.#base = styles.element;
        this.#ownsBase = styles.owned;
        this.#custom = element("style", "");
        this.#custom.textContent = css;
        document.head.append(this.#custom);
        this.#previousTitle = document.title;
        this.#previousTheme = document.documentElement.dataset.theme;
        this.#systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
        this.#previousKeyboard = document.documentElement.style.getPropertyValue("--pp-keyboard-height");
        this.#host = window.frameElement?.ownerDocument.documentElement;
        this.#syncAppearance();
        this.#systemTheme.addEventListener("change", this.#syncAppearance);
        if (this.#host) {
            this.#observer = new MutationObserver(this.#syncAppearance);
            this.#observer.observe(this.#host, { attributes: true, attributeFilter: ["data-theme", "style"] });
        }
        document.title = metadata.name ?? definition.module;
        try {
            this.#root.replaceChildren();
            this.#panel = new PreferencesPanel(this.#root, rendered);
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    /**
     * 跟随嵌入宿主的通用环境状态，不识别业务 App 或解析其 UA。
     * Follow generic host appearance without detecting a business App or parsing its UA.
     * @returns {void} 已同步主题与键盘避让 / Theme and keyboard clearance synchronized.
     */
    #syncAppearance = () => {
        const theme = this.#host?.dataset.theme ?? this.#previousTheme ?? (this.#systemTheme.matches ? "dark" : "light");
        document.documentElement.dataset.theme = theme;
        if (this.#host) document.documentElement.style.setProperty("--pp-keyboard-height", this.#host.style.getPropertyValue("--pp-keyboard-height"));
    };

    /**
     * 释放模块视图、样式与会话，不操作项目入口页。
     * Release the module view, styles, and session without operating a project landing page.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#observer?.disconnect();
        this.#systemTheme.removeEventListener("change", this.#syncAppearance);
        this.#panel?.destroy();
        if (this.#ownsBase) this.#base.remove();
        this.#custom.remove();
        if (this.#existing) this.#root.replaceChildren();
        else this.#root.remove();
        document.title = this.#previousTitle;
        if (this.#previousTheme === undefined) delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = this.#previousTheme;
        document.documentElement.style.setProperty("--pp-keyboard-height", this.#previousKeyboard);
    }
}

/**
 * 使用模块 API 返回的模型挂载设置页；CSS 仅覆盖当前模块。
 * Mount a settings page from a module API model; CSS only overrides this module.
 * @param {import("../index.js").ModuleModel} model API 返回的模块模型 / Module model returned by the API.
 * @param {string} [css] 可选 CSS 正文 / Optional module-scoped CSS text.
 * @returns {PreferencesView} 模块视图 / Module view.
 */
export function mount(model, css = "") {
    return new PreferencesView(model, css);
}
