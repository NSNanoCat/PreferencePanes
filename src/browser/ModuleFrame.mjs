import { pageInputs } from "../lib/page-inputs.mjs";

/**
 * 模块文档容器：原始 HTML 不改写，请求上下文随 iframe 元素传递。
 * Module document container: preserve HTML verbatim and carry request context on the iframe element.
 */
export class ModuleFrame extends EventTarget {
    #url;
    #options;
    #controller = new AbortController();
    #abort = () => this.destroy();
    #state;
    #change = event => {
        this.#state = { ...event.detail, actions: event.detail.actions ?? [] };
        this.dispatchEvent(new Event("change"));
    };
    #confirmation = event => {
        const request = new CustomEvent("confirm", { cancelable: true, detail: event.detail });
        if (!this.dispatchEvent(request)) event.preventDefault();
    };
    #notice = event => {
        const notice = new CustomEvent("notice", { cancelable: true, detail: event.detail });
        if (!this.dispatchEvent(notice)) event.preventDefault();
    };

    /**
     * 建立 iframe 与请求输入；调用方挂载 element 后调用 load。
     * Create the iframe and request inputs; callers mount element and then call load.
     * @param {string | URL} url 模块请求地址 / Module request URL.
     * @param {RequestInit} [options] 原生请求头和取消信号 / Native headers and cancellation signal.
     */
    constructor(url, options = {}) {
        super();
        this.#url = new URL(url, document.baseURI);
        this.#options = { ...options, headers: new Headers(options.headers) };
        const inputs = pageInputs(this.#url, Object.fromEntries(this.#options.headers));
        this.element = document.createElement("iframe");
        this.element.title = `${inputs.module} 设置`;
        this.element.dataset.preferencePanes = JSON.stringify(inputs);
        this.element.addEventListener("preferencepanes:change", this.#change);
        this.element.addEventListener("preferencepanes:confirm", this.#confirmation);
        this.element.addEventListener("preferencepanes:notice", this.#notice);
        this.#state = { title: inputs.module, module: inputs.module, busy: false, canGoBack: true, actions: [] };
        options.signal?.addEventListener("abort", this.#abort, { once: true });
    }

    /**
     * 当前模块导航状态。
     * Current module navigation state.
     */
    get state() {
        return { ...this.#state };
    }

    /**
     * 获取原始 HTML；晚到响应在退出后不得重新挂载。
     * Fetch unmodified HTML; a late response must not remount after departure.
     * @returns {Promise<void>} HTML 已交给 iframe；表单状态通过 change 事件提供 / HTML assigned; form state is reported through change.
     */
    async load() {
        if (this.#options.signal?.aborted) this.destroy();
        const timer = setTimeout(() => this.#controller.abort(), 10000);
        try {
            const response = await fetch(this.#url, { cache: "no-store", credentials: "omit", ...this.#options, signal: this.#controller.signal });
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            this.#controller.signal.throwIfAborted();
            this.element.srcdoc = html;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * 使用 iframe 的联合历史返回；写入期间不导航。
     * Navigate joint iframe history back, except while a write is pending.
     * @returns {void} 无返回值 / No return value.
     */
    back() {
        if (!this.#state.busy && this.#state.canGoBack) this.element.contentWindow.history.back();
    }

    /**
     * 向模块发送菜单操作，不让宿主访问内部 DOM 或存储客户端。
     * Dispatch a menu action without host access to internal DOM or the storage client.
     * @param {string} id 当前可用操作 / Available action identifier.
     * @returns {void} 无返回值 / No return value.
     */
    perform(id) {
        if (this.#state.busy || !this.#state.actions.some(action => action.id === id)) throw new Error("Action is not available");
        this.element.dispatchEvent(new CustomEvent("preferencepanes:action", { detail: id }));
    }

    /**
     * 取消加载与事件订阅；节点保留到 Navigation 的退出动画结束。
     * Cancel loading and subscriptions; Navigation retains the node until its exit animation ends.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#controller.abort();
        this.#options.signal?.removeEventListener("abort", this.#abort);
        this.element.removeEventListener("preferencepanes:change", this.#change);
        this.element.removeEventListener("preferencepanes:confirm", this.#confirmation);
        this.element.removeEventListener("preferencepanes:notice", this.#notice);
    }
}
