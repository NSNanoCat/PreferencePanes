import { normalizeBoxJs } from "./boxjs.mjs";
import { statusView } from "./components.mjs";
import { mount } from "./mount.mjs";
import { installDefaultStyles } from "./styles.mjs";

/**
 * 管理模块文档的配置请求、重载和错误状态。
 * Manage configuration requests, reloads, and error states for a module document.
 */
class ModulePage {
    #window;
    #root;
    #view;

    /**
     * 创建模块页面控制器并安装基础样式。
     * Create the module page controller and install base styles.
     * @param {Document} document 模块文档 / Module document.
     */
    constructor(document) {
        this.#window = document.defaultView;
        this.#root = document.querySelector("#preferences");
        installDefaultStyles(document);
        this.#window.addEventListener("pageshow", this.#show);
    }

    /**
     * 读取页面声明的 BoxJS JSON 并挂载通用前端。
     * Read the BoxJS JSON declared by the page and mount the generic frontend.
     * @returns {Promise<void>} 启动完成 / Startup completion.
     */
    async start() {
        try {
            this.#view?.destroy();
            this.#view = undefined;
            this.#root.replaceChildren(statusView("读取设置…"));
            const embedded = this.#window.frameElement?.dataset.preferencePanesModule;
            const match = /^\/settings\/([a-zA-Z0-9_-]+)\/?$/.exec(this.#window.location.pathname);
            const module = embedded ?? match?.[1];
            if (!module) throw new TypeError("Open a concrete module URL");
            const frame = this.#window.frameElement?.dataset;
            const base = frame?.preferencePanesBase ?? this.#window.location.href;
            this.#window.document.querySelector("link[data-preference-panes-stylesheet]")?.remove();
            const stylesheetSource = frame?.preferencePanesStylesheet ?? new URLSearchParams(this.#window.location.search).get("css")?.trim();
            if (stylesheetSource) {
                const stylesheet = new URL(stylesheetSource, base);
                if (!["http:", "https:"].includes(stylesheet.protocol)) throw new TypeError("CSS resource must use HTTP(S)");
                const link = this.#window.document.createElement("link");
                link.dataset.preferencePanesStylesheet = "true";
                link.rel = "stylesheet";
                link.href = stylesheet.href;
                this.#window.document.head.append(link);
            }
            const jsonSource = frame?.preferencePanesJson ?? new URLSearchParams(this.#window.location.search).get("json")?.trim();
            const source = new URL(jsonSource || `/api/${encodeURIComponent(module)}`, base);
            if (!["http:", "https:"].includes(source.protocol)) throw new TypeError("BoxJS resource must use HTTP(S)");
            const response = await fetch(source, { cache: "no-store", credentials: "omit", headers: { Accept: "application/json" } });
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            const boxjs = await response.json();
            normalizeBoxJs(boxjs, module);
            this.#view = mount(boxjs);
        } catch (error) {
            this.#root.replaceChildren(statusView(`加载失败：${error.message}`, () => this.start()));
        }
    }

    /**
     * 释放页面视图和页面级监听器。
     * Release the page view and page-level listener.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#window.removeEventListener("pageshow", this.#show);
        this.#view?.destroy();
        this.#view = undefined;
    }

    /**
     * 从前进后退缓存恢复时重新加载模块。
     * Reload the module when restored from the back-forward cache.
     * @param {PageTransitionEvent} event 页面显示事件 / Page show event.
     * @returns {void} 无返回值 / No return value.
     */
    #show = event => {
        if (event.persisted) this.start();
    };
}

new ModulePage(document).start();
