import { pageInputs } from "../lib/page-inputs.mjs";
import { statusView } from "./components.mjs";
import { PreferencesView } from "./mount.mjs";
import { installDefaultStyles } from "./styles.mjs";

/**
 * 管理模块文档的页面输入、初始请求、重载和错误状态。
 * Manage page inputs, initial requests, reloads, and error states for a module document.
 */
export class ModulePage {
    #document;
    #window;
    #root;
    #view;

    /**
     * 创建模块页面控制器并安装基础样式。
     * Create the module page controller and install base styles.
     * @param {Document} document 模块文档 / Module document.
     */
    constructor(document) {
        this.#document = document;
        this.#window = document.defaultView;
        this.#root = document.querySelector("#preferences");
        installDefaultStyles(document);
        this.#window.addEventListener("pageshow", this.#show);
    }

    /**
     * 从 URL 或代理传递的 Header 导入 JSON/CSS，支持独立文档与 srcdoc。
     * Import JSON/CSS from the URL or proxy-carried headers in standalone and srcdoc documents.
     * @returns {Promise<void>} 启动完成 / Startup completion.
     */
    async start() {
        try {
            this.#view?.destroy();
            this.#view = undefined;
            this.#root.replaceChildren(statusView("读取设置…"));
            const inputs = this.#readInputs();
            const apiURL = new URL(`/api/${encodeURIComponent(inputs.module)}`, inputs.url).href;
            const styleURL = this.#resourceURL(inputs.css, inputs.url);
            const [style, modelResponse] = await Promise.all([styleURL ? fetch(styleURL, { cache: "no-store", credentials: "omit" }) : null, fetch(apiURL, { cache: "no-store", credentials: "omit", headers: { Accept: "application/json", "X-PreferencePanes-JSON": inputs.json } })]);
            if ((style && style.status !== 200) || modelResponse.status !== 200) throw new Error(`HTTP ${modelResponse.status !== 200 ? modelResponse.status : style.status}`);
            this.#view = new PreferencesView(await modelResponse.json(), style ? await style.text() : "");
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
     * 读取嵌入参数、文档元数据或当前 URL 输入。
     * Read embedded parameters, document metadata, or current URL inputs.
     * @returns {ReturnType<typeof pageInputs>} 页面输入 / Page inputs.
     */
    #readInputs() {
        const context = this.#document.querySelector('meta[name="preference-panes-inputs"]');
        const embedded = this.#window.frameElement?.dataset.preferencePanes;
        switch (true) {
            case embedded !== undefined:
                this.#document.documentElement.dataset.preferencePanesEmbedded = "";
                return JSON.parse(embedded);
            case context !== null:
                return JSON.parse(decodeURIComponent(context.content));
            default:
                return pageInputs(new URL(this.#window.location.href));
        }
    }

    /**
     * 将可选页面资源限制为 HTTP(S) 地址。
     * Restrict an optional page resource to an HTTP(S) URL.
     * @param {string | undefined} source 资源地址 / Resource location.
     * @param {string} baseURL 页面基准地址 / Page base URL.
     * @returns {string | null} 绝对资源地址 / Absolute resource URL.
     */
    #resourceURL(source, baseURL) {
        if (!source) return null;
        const url = new URL(source, baseURL);
        if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Resources must use HTTP(S) URLs");
        return url.href;
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
