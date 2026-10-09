import { resolveStoredValue, validValue } from "./boxjs.mjs";

/**
 * 管理单模块页面的 API 请求、值快照和会话终止。
 * Manage API requests, value snapshots, and session termination for one module page.
 */
export class PreferencesClient {
    #module;
    #definition;
    #request;
    #notify;
    #timeout;
    #session = new AbortController();
    #values = {};
    #warnings = {};
    #saving = false;
    #arrays = new Map();

    /**
     * 创建从 BoxJS 定义读取和持久化设置的页面客户端。
     * Create a page client that reads and persists settings from a BoxJS definition.
     * @param {import("./client.mjs").PreferencesClientOptions} options 字段定义、请求与通知 / Field definition, requests, and notifications.
     */
    constructor({ definition, fetch: request = globalThis.fetch.bind(globalThis), notify = () => {}, timeout = 10000 }) {
        this.#module = definition.module;
        this.#definition = definition;
        this.#request = request;
        this.#notify = notify;
        this.#timeout = timeout;
    }

    /**
     * 读取一次 Settings 子树并建立页面值快照。
     * Read the Settings subtree once and establish the page value snapshot.
     * @returns {Promise<import("./client.mjs").ModuleSnapshot>} 页面快照 / Page snapshot.
     */
    async open() {
        let subtree = await this.readSettings();
        if (subtree === undefined) subtree = {};
        if (typeof subtree === "string") subtree = JSON.parse(subtree);
        if (!subtree || typeof subtree !== "object" || Array.isArray(subtree)) throw new TypeError("Expected a settings subtree object");
        const values = {};
        const warnings = {};
        this.#arrays.clear();
        for (const field of this.#definition.fields) {
            const indexed = /^(.*)\.(\d+)$/.exec(field.key);
            if (indexed && !this.#arrays.has(indexed[1])) {
                const storedArray = indexed[1]
                    .split(".")
                    .slice(this.#definition.settingsPath.length)
                    .reduce((parent, part) => Object(parent)[part], subtree);
                this.#arrays.set(indexed[1], Array.isArray(storedArray) ? [...storedArray] : []);
            }
            const stored = field.key
                .split(".")
                .slice(this.#definition.settingsPath.length)
                .reduce((parent, part) => Object(parent)[part], subtree);
            const resolved = resolveStoredValue(field, stored);
            if (Object.prototype.hasOwnProperty.call(resolved, "value")) values[field.key] = resolved.value;
            if (resolved.warning) warnings[field.key] = resolved.warning;
        }
        this.#values = values;
        this.#warnings = warnings;
        return this.snapshot();
    }

    /**
     * 获取当前字段定义和值的深拷贝，不发起网络请求。
     * Return a deep copy of the current field definition and values without a network request.
     * @returns {import("./client.mjs").ModuleSnapshot} 会话快照 / Session snapshot.
     */
    snapshot() {
        return JSON.parse(JSON.stringify({ definition: this.#definition, values: this.#values, warnings: this.#warnings }));
    }

    /**
     * 读取 Settings 子树。
     * Read the Settings subtree.
     * @returns {Promise<unknown>} Settings 内容或 undefined / Settings content or undefined.
     */
    async readSettings() {
        const response = await this.#send("get", `@${this.#definition.storageKey}.${this.#definition.settingsPath.join(".")}`);
        return response.status === 404 ? undefined : response.json();
    }

    /**
     * 读取 Caches 子树。
     * Read the Caches subtree.
     * @returns {Promise<unknown>} Caches 内容或 undefined / Caches content or undefined.
     */
    async readCaches() {
        const response = await this.#send("get", this.#definition.cachePath ?? `@${this.#definition.storageKey}.${this.#module}.Caches`);
        return response.status === 404 ? undefined : response.json();
    }

    /**
     * 删除声明的缓存子树，默认当前模块 Caches。
     * Delete the declared cache subtree, defaulting to the current module Caches.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    clearCaches() {
        const path = this.#definition.cachePath?.slice(this.#definition.storageKey.length + 2) ?? `${this.#module}.Caches`;
        return this.#change("delete", path, undefined, "clearCaches");
    }

    /**
     * 删除声明的设置子树，默认删除当前模块数据，并恢复页面默认值。
     * Delete declared settings subtrees, defaulting to current module data, and restore page defaults.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    reset() {
        return this.#change("delete", this.#module, undefined, "reset");
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
        return this.#change("set", key, value, "write");
    }

    /**
     * 删除单个字段覆盖值。
     * Delete one field override.
     * @param {string} key 字段路径 / Field path.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    remove(key) {
        return this.#change("delete", key, undefined, "delete");
    }

    /**
     * 向固定存储 API 发送完整路径的 form 动作。
     * Send a complete-path form action to the fixed storage API.
     * @param {"get" | "set" | "delete"} action 存储动作 / Storage action.
     * @param {string} path 完整 @root.path / Complete @root.path.
     * @param {unknown} [value] set 写入值 / Value written by set.
     * @returns {Promise<Response>} 原始响应 / Raw response.
     */
    async #send(action, path, value) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (this.#session.signal.aborted) abort();
        this.#session.signal.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, this.#timeout);
        try {
            const response = await this.#request(`/api/${action}`, {
                method: "POST",
                credentials: "omit",
                cache: "no-store",
                signal: controller.signal,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams([[path, action === "set" ? JSON.stringify(value) : ""]]).toString(),
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
     * @param {string} key 不含存储根的路径 / Path without the storage root.
     * @param {unknown} value set 写入值 / Value written by set.
     * @param {"write" | "delete" | "clearCaches" | "reset"} operation 通知操作 / Notification operation.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    async #change(action, key, value, operation) {
        if (this.#saving) throw new Error("A settings write is already in progress");
        this.#saving = true;
        try {
            switch (operation) {
                case "write":
                case "delete": {
                    const field = this.#definition.fields.find(candidate => candidate.key === key);
                    if (!field || (operation === "write" && !validValue(field, value))) throw new TypeError("Invalid setting value");
                    const indexed = /^(.*)\.(\d+)$/.exec(key);
                    if (indexed) {
                        const array = [...(this.#arrays.get(indexed[1]) ?? [])];
                        for (const sibling of this.#definition.fields) {
                            if (sibling.key.startsWith(`${indexed[1]}.`) && /^\d+$/.test(sibling.key.slice(indexed[1].length + 1))) {
                                const index = Number(sibling.key.slice(indexed[1].length + 1));
                                if (array[index] === undefined) array[index] = this.#values[sibling.key] ?? sibling.defaultValue;
                            }
                        }
                        array[Number(indexed[2])] = operation === "delete" ? field.defaultValue : value;
                        await this.#send("set", `@${this.#definition.storageKey}.${indexed[1]}`, array);
                        this.#arrays.set(indexed[1], array);
                    } else await this.#send(action, `@${this.#definition.storageKey}.${key}`, value);
                    switch (operation) {
                        case "write":
                            this.#values[key] = JSON.parse(JSON.stringify(value));
                            delete this.#warnings[key];
                            break;
                        case "delete":
                            delete this.#values[key];
                            delete this.#warnings[key];
                            if (Object.prototype.hasOwnProperty.call(field, "defaultValue")) this.#values[key] = JSON.parse(JSON.stringify(field.defaultValue));
                            break;
                    }
                    break;
                }
                case "clearCaches":
                    await this.#send(action, `@${this.#definition.storageKey}.${key}`, value);
                    break;
                case "reset":
                    if (this.#definition.resetPaths) {
                        for (const path of this.#definition.resetPaths) await this.#send("delete", path);
                    } else await this.#send(action, `@${this.#definition.storageKey}.${key}`, value);
                    this.#arrays.clear();
                    this.#warnings = {};
                    for (const field of this.#definition.fields) {
                        delete this.#values[field.key];
                        if (Object.prototype.hasOwnProperty.call(field, "defaultValue")) this.#values[field.key] = JSON.parse(JSON.stringify(field.defaultValue));
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
