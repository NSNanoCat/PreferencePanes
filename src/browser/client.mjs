/**
 * 管理单模块页面的 API 请求、值快照和会话终止。
 * Manage API requests, value snapshots, and session termination for one module page.
 */
export class PreferencesClient {
    #module;
    #configURL;
    #definition;
    #request;
    #notify;
    #timeout;
    #session = new AbortController();
    #values;
    #saving = false;

    /**
     * 创建只调用模块 API、不读取或解析 BoxJS 的页面客户端。
     * Create a page client that only calls the module API and never reads or parses BoxJS.
     * @param {import("./client.mjs").PreferencesClientOptions} options API 模型、请求与通知 / API model, requests, and notifications.
     */
    constructor({ model, definition, fetch: request = globalThis.fetch.bind(globalThis), notify = () => {}, timeout = 10000 }) {
        this.#module = model.module;
        this.#configURL = model.configURL;
        this.#definition = definition;
        this.#request = request;
        this.#notify = notify;
        this.#timeout = timeout;
        this.#values = structuredClone(model.values);
    }

    /**
     * 获取当前字段定义和值的深拷贝，不发起网络请求。
     * Return a deep copy of the current field definition and values without a network request.
     * @returns {import("./client.mjs").ModuleSnapshot} 会话快照 / Session snapshot.
     */
    snapshot() {
        return structuredClone({ definition: this.#definition, values: this.#values });
    }

    /**
     * 读取 Settings 子树。
     * Read the Settings subtree.
     * @returns {Promise<unknown>} Settings 内容或 undefined / Settings content or undefined.
     */
    async readSettings() {
        const response = await this.#send("get", { scope: "settings" });
        return response.status === 404 ? undefined : response.json();
    }

    /**
     * 读取 Caches 子树。
     * Read the Caches subtree.
     * @returns {Promise<unknown>} Caches 内容或 undefined / Caches content or undefined.
     */
    async readCaches() {
        const response = await this.#send("get", { scope: "caches" });
        return response.status === 404 ? undefined : response.json();
    }

    /**
     * 删除当前模块的 Caches 子树。
     * Delete the current module Caches subtree.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    clearCaches() {
        return this.#change("delete", { scope: "caches" }, "clearCaches");
    }

    /**
     * 删除当前模块数据并恢复页面默认值。
     * Delete current module data and restore page defaults.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    reset() {
        return this.#change("delete", { scope: "module" }, "reset");
    }

    /**
     * 终止当前页面仍在进行的请求。
     * Abort requests still owned by the current page.
     * @returns {void} 无返回值 / No return value.
     */
    leave() {
        this.#session.abort();
    }

    /**
     * 写入单个字段。
     * Write one field.
     * @param {string} key 字段路径 / Field path.
     * @param {unknown} value 已校验值 / Validated value.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    set(key, value) {
        return this.#change("set", { key, value }, "write", key);
    }

    /**
     * 删除单个字段覆盖值。
     * Delete one field override.
     * @param {string} key 字段路径 / Field path.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    remove(key) {
        return this.#change("delete", { key }, "delete", key);
    }

    /**
     * 向模块 API 发送 JSON 动作。
     * Send a JSON action to the module API.
     * @param {"get" | "set" | "delete"} action 模块动作 / Module action.
     * @param {unknown} payload JSON 请求体 / JSON request body.
     * @returns {Promise<Response>} 原始响应 / Raw response.
     */
    async #send(action, payload) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (this.#session.signal.aborted) abort();
        this.#session.signal.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, this.#timeout);
        try {
            const response = await this.#request(`/api/${encodeURIComponent(this.#module)}/${action}`, {
                method: "POST",
                credentials: "omit",
                cache: "no-store",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", "X-PreferencePanes-JSON": this.#configURL },
                body: JSON.stringify(payload),
            });
            if (response.status !== 200 && !(action === "get" && response.status === 404)) throw new Error(`HTTP ${response.status}`);
            return response;
        } finally {
            clearTimeout(timer);
            this.#session.signal.removeEventListener("abort", abort);
        }
    }

    /**
     * 执行写入动作；成功后只更新当前页面值。
     * Execute a mutation and update only the current page values after success.
     * @param {"set" | "delete"} action API 动作 / API action.
     * @param {Record<string, unknown>} payload JSON 请求体 / JSON request body.
     * @param {"write" | "delete" | "clearCaches" | "reset"} operation 通知操作 / Notification operation.
     * @param {string} [key] 字段路径 / Field path.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    async #change(action, payload, operation, key) {
        if (this.#saving) throw new Error("A settings write is already in progress");
        this.#saving = true;
        try {
            await this.#send(action, payload);
            switch (operation) {
                case "write":
                    this.#values[key] = structuredClone(payload.value);
                    break;
                case "delete": {
                    const field = this.#definition.fields.find(candidate => candidate.key === key);
                    delete this.#values[key];
                    if (field && Object.hasOwn(field, "defaultValue")) this.#values[key] = structuredClone(field.defaultValue);
                    break;
                }
                case "clearCaches":
                    break;
                case "reset":
                    for (const field of this.#definition.fields) {
                        delete this.#values[field.key];
                        if (Object.hasOwn(field, "defaultValue")) this.#values[field.key] = structuredClone(field.defaultValue);
                    }
                    break;
            }
            this.#notify({ kind: "success", operation, module: this.#module, key });
        } catch (error) {
            this.#notify({ kind: "error", operation, module: this.#module, key, message: error.message });
            throw error;
        } finally {
            this.#saving = false;
        }
    }
}
