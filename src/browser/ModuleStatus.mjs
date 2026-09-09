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
     * @returns {Promise<void>} 探测完成 / Probe completion.
     */
    async check(url) {
        this.#controller?.abort();
        const controller = (this.#controller = new AbortController());
        this.#render("checking");
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
            const response = await fetch(url, { method: "HEAD", cache: "no-store", credentials: "omit", signal: controller.signal });
            if (controller !== this.#controller) return;
            const version = response.headers.get("X-PreferencePanes-Version")?.trim() || null;
            this.#render(response.status === 200 ? "installed" : "missing", version);
        } catch {
            if (controller === this.#controller) this.#render("missing");
        } finally {
            clearTimeout(timer);
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
