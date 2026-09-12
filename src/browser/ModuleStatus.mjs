/**
 * 模块探测请求选项。
 * Options for a module probe request.
 * @typedef {object} ModuleProbeOptions
 * @property {typeof globalThis.fetch} [fetch] 可注入的 fetch / Injectable fetch.
 * @property {AbortSignal} [signal] 外部取消信号 / External cancellation signal.
 * @property {number} [timeout] 超时毫秒数，默认 3500 / Timeout in milliseconds, defaults to 3500.
 */

/**
 * 通过模块 JSON Mock 的 HEAD 响应检测安装状态和业务版本。
 * Probe installation and business version from the native HEAD response of a module JSON Mock.
 * @param {string | URL} url 配置 Mock 地址 / Configuration Mock URL.
 * @param {ModuleProbeOptions} [options] 请求选项 / Request options.
 * @returns {Promise<Response>} 原始 HTTP 响应，可直接读取 status 和响应头 / Native HTTP response; read status and headers directly.
 */
export async function probeModule(url, { fetch: request = globalThis.fetch, signal, timeout = 3500 } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await request(url, { method: "HEAD", cache: "no-store", credentials: "omit", signal: controller.signal });
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
    }
}

/**
 * 模块入口的固定状态行，只通过 HEAD 探测安装状态和业务版本。
 * Fixed module status row, probing installation and business version with HEAD only.
 */
export class ModuleStatus extends EventTarget {
    #element;
    #controller;
    #state = { status: "checking", version: null };

    /**
     * 绑定调用方提供的状态行。
     * Bind a caller-owned status row.
     * @param {HTMLElement} element 状态文字容器 / Status text container.
     */
    constructor(element) {
        super();
        this.#element = element;
        this.#render("checking");
    }

    /**
     * 当前安装状态与业务版本。
     * Current installation state and business version.
     */
    get state() {
        return { ...this.#state };
    }

    /**
     * 每次进入重新探测，取消旧请求并忽略其迟到结果。
     * Reprobe on entry, cancelling old requests and ignoring late results.
     * @param {string | URL} url 配置 Mock 地址 / Configuration Mock URL.
     * @param {ModuleProbeOptions} [options] 请求选项 / Request options.
     * @returns {Promise<Response | undefined>} 原始响应；被取消时无返回值 / Native response; undefined when cancelled.
     */
    async check(url, options = {}) {
        this.#controller?.abort();
        const controller = new AbortController();
        this.#controller = controller;
        const externalSignal = options.signal;
        const abort = () => controller.abort();
        if (externalSignal?.aborted) abort();
        externalSignal?.addEventListener("abort", abort, { once: true });
        this.#render("checking");
        try {
            const response = await probeModule(url, { ...options, signal: controller.signal });
            if (controller !== this.#controller) return response;
            const version = response.status === 200 ? response.headers.get("X-PreferencePanes-Version")?.trim() || null : null;
            this.#render(response.status === 200 ? "installed" : "missing", version);
            return response;
        } catch (error) {
            if (controller !== this.#controller) return;
            if (externalSignal?.aborted) throw error;
            this.#render("missing");
        } finally {
            externalSignal?.removeEventListener("abort", abort);
        }
    }

    /**
     * 更新状态标签，缺少版本时不伪造版本号。
     * Render the label without inventing a missing version.
     * @param {"checking" | "installed" | "missing"} status 状态 / State.
     * @param {string | null} [version] 业务版本 / Business version.
     * @returns {void} 无返回值 / No return value.
     */
    #render(status, version = null) {
        this.#state = { status, version: status === "installed" ? version : null };
        switch (status) {
            case "checking":
                this.#element.textContent = "检测中";
                break;
            case "installed":
                this.#element.textContent = version ?? "版本未知";
                break;
            case "missing":
                this.#element.textContent = "未安装";
                break;
        }
        this.#element.dataset.state = status;
        this.#element.title = this.#element.textContent;
        this.dispatchEvent(new Event("change"));
    }

    /**
     * 释放尚未完成的探测。
     * Release pending probes.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#controller?.abort();
        this.#controller = undefined;
    }
}
