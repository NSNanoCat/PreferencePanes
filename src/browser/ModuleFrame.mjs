/**
 * 模块文档容器：发送 GET 请求并将原始 HTML 交给 iframe，只在元素上标记模块身份。
 * Module document container: send a GET request, preserve HTML verbatim and mark only the module identity on the iframe.
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
    #forward(type, event) {
        if (!this.dispatchEvent(new CustomEvent(type, { cancelable: true, detail: event.detail }))) event.preventDefault();
    }
    #confirmation = event => this.#forward("confirm", event);
    #notice = event => this.#forward("notice", event);
    #openURL = event => this.#forward("open-url", event);

    /**
     * 建立 iframe；调用方挂载 element 后调用 load。
     * Create the iframe; callers mount element and then call load.
     * @param {string | URL} url 模块请求地址 / Module request URL.
     * @param {{signal?: AbortSignal, headers?: HeadersInit}} [options] 请求选项 / Request options.
     */
    constructor(url, options = {}) {
        super();
        this.#url = new URL(url, document.baseURI);
        const match = /^\/settings\/([a-zA-Z0-9_-]+)\/?$/.exec(this.#url.pathname);
        if (!match) throw new TypeError("Open a concrete module URL");
        this.#options = { signal: options.signal, headers: options.headers };
        this.element = document.createElement("iframe");
        this.element.title = `${match[1]} 设置`;
        this.element.dataset.preferencePanes = "true";
        this.element.dataset.preferencePanesModule = match[1];
        this.element.addEventListener("preferencepanes:change", this.#change);
        this.element.addEventListener("preferencepanes:confirm", this.#confirmation);
        this.element.addEventListener("preferencepanes:notice", this.#notice);
        this.element.addEventListener("preferencepanes:open-url", this.#openURL);
        this.#state = { title: match[1], module: match[1], busy: false, canGoBack: true, actions: [] };
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
            const response = await fetch(this.#url, { method: "GET", cache: "no-store", credentials: "omit", headers: this.#options.headers, signal: this.#controller.signal });
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
        this.element.removeEventListener("preferencepanes:open-url", this.#openURL);
    }
}
