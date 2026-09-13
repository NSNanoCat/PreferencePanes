import { normalizeBoxJs } from "./boxjs.mjs";
import { element, resourceURL } from "./components.mjs";
import { PreferencesPanel } from "./panel.mjs";
import { installDefaultStyles } from "./styles.mjs";

/**
 * 管理 BoxJS 规范化、主题同步和面板生命周期。
 * Manage BoxJS normalization, theme synchronization, and panel lifecycle.
 */
class PreferencesView {
    #existing;
    #root;
    #base;
    #ownsBase;
    #previousTitle;
    #previousTheme;
    #systemTheme;
    #previousKeyboard;
    #host;
    #observer;
    #panel;

    /**
     * 使用原始 BoxJS JSON 挂载设置页。
     * Mount a settings page from raw BoxJS JSON.
     * @param {import("../index.js").BoxJSInput} boxjs 单模块 BoxJS JSON / Single-module BoxJS JSON.
     */
    constructor(boxjs) {
        const definition = normalizeBoxJs(boxjs);
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
            this.#panel = new PreferencesPanel(this.#root, definition);
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
        if (this.#existing) this.#root.replaceChildren();
        else this.#root.remove();
        document.title = this.#previousTitle;
        if (this.#previousTheme === undefined) delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = this.#previousTheme;
        document.documentElement.style.setProperty("--pp-keyboard-height", this.#previousKeyboard);
    }
}

/**
 * 使用原始 BoxJS JSON 挂载设置页。
 * Mount a settings page from raw BoxJS JSON.
 * @param {import("../index.js").BoxJSInput} boxjs 单模块 BoxJS JSON / Single-module BoxJS JSON.
 * @returns {import("./index.js").MountedPreferences} 模块视图 / Module view.
 */
export function mount(boxjs) {
    return new PreferencesView(boxjs);
}
