/**
 * 单个模块的临时会话；离开页面后丢弃。
 * Transient module session discarded when leaving the page.
 * @typedef {object} ModuleSession
 * @property {AbortController} controller 读取请求的取消控制器 / Abort controller for reads.
 * @property {import("../index.js").ModuleDefinition | null} definition API 返回的配置模型 / Configuration model returned by the API.
 * @property {import("./client.mjs").ModuleSnapshot["values"]} values 当前显示值 / Current display values.
 * @property {string} configURL BoxJS JSON 来源 / BoxJS JSON source.
 * @property {boolean} saving 是否正在写入 / Whether a mutation is in progress.
 */

/**
 * 创建页面会话缓存；打开时由模块 API 重读，选项操作仅在 HTTP 200 后更新缓存。
 * Create a page-session cache; the module API reloads it on open and mutations update it only after HTTP 200.
 * @param {import("./client.mjs").PreferencesClientOptions} options API 地址、请求与通知 / API URL, requests and notifications.
 * @returns {import("./client.mjs").PreferencesClient} 通用客户端 / Generic client.
 */
export function createPreferencesClient({ apiBase = "/api/module", configURL = module => `/configs/${module}`, fetch: request = globalThis.fetch.bind(globalThis), notify = () => {}, timeout = 10000 }) {
    const resolveConfigURL = typeof configURL === "function" ? configURL : () => configURL;
    /** @type {Map<string, ModuleSession>} */
    const sessions = new Map();

    /**
     * 向模块 API 发送 JSON 请求。
     * Send a JSON request to the module API.
     * @param {string} module 模块标识 / Module identifier.
     * @param {string} action 模块动作 / Module action.
     * @param {unknown} payload JSON 请求体 / JSON request body.
     * @param {AbortSignal | undefined} signal 会话取消信号 / Session cancellation signal.
     * @returns {Promise<Response>} 原始响应 / Raw response.
     */
    async function send(module, action, payload, signal, source = resolveConfigURL(module)) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (signal?.aborted) abort();
        signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, timeout);
        try {
            const response = await request(`${apiBase}/${encodeURIComponent(module)}/${action}`, {
                method: "POST",
                credentials: "omit",
                cache: "no-store",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", "X-PreferencePanes-JSON": source },
                body: JSON.stringify(payload ?? {}),
            });
            if (response.status !== 200 && !(action === "get" && response.status === 404)) throw new Error(`HTTP ${response.status}`);
            return response;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
        }
    }

    /**
     * 获取独立快照，避免调用方修改内部缓存。
     * Return an independent snapshot so callers cannot mutate the cache.
     * @param {string} module 已打开模块 / Open module.
     * @returns {import("./client.mjs").ModuleSnapshot} 会话快照 / Session snapshot.
     */
    const snapshot = module => {
        const state = sessions.get(module);
        if (!state?.definition) throw new Error("Open the module first");
        return structuredClone({ definition: state.definition, values: state.values });
    };

    /**
     * 执行单个模块动作，并在成功后更新当前页面缓存。
     * Execute one module action and update the page cache after success.
     * @param {string} module 模块标识 / Module identifier.
     * @param {string} action 模块动作 / Module action.
     * @param {unknown} payload JSON 请求体 / JSON request body.
     * @param {"write" | "delete" | "clearCaches" | "reset"} operation 操作类型 / Operation kind.
     * @param {string | undefined} key 页面字段路径 / Page field path.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    async function change(module, action, payload, operation, key) {
        const state = sessions.get(module);
        if (!state?.definition) throw new Error("Open the module first");
        if (state.saving) throw new Error("A settings write is already in progress");
        state.saving = true;
        try {
            await send(module, action, payload, state.controller.signal, state.configURL);
            if (sessions.get(module) === state) {
                switch (operation) {
                    case "write":
                        state.values[key] = structuredClone(payload.value);
                        break;
                    case "delete":
                    case "clearCaches":
                    case "reset":
                        for (const field of state.definition.fields) {
                            if (operation === "delete" && field.key !== key && !field.key.startsWith(`${key}.`)) continue;
                            if (operation === "clearCaches" && field.key.includes(".Caches.")) continue;
                            if (operation === "reset" && !field.key.startsWith(`${state.definition.module}.`)) continue;
                            delete state.values[field.key];
                            if (Object.hasOwn(field, "defaultValue")) state.values[field.key] = structuredClone(field.defaultValue);
                        }
                        break;
                }
            }
            notify({ kind: "success", operation, module, key });
        } catch (error) {
            notify({ kind: "error", operation, module, key, message: error.message });
            throw error;
        } finally {
            state.saving = false;
        }
    }

    return {
        /**
         * 通过模块 API 获取配置模型和当前设置，建立新的页面会话。
         * Fetch the configuration model and current settings through the module API.
         * @param {string} module 模块标识 / Module identifier.
         * @returns {Promise<import("./client.mjs").ModuleSnapshot>} 新快照 / New snapshot.
         */
        async open(module, initialModel) {
            const previous = sessions.get(module);
            if (previous?.saving) throw new Error("Cannot refresh while saving");
            previous?.controller.abort();
            const state = { controller: new AbortController(), definition: null, values: {}, configURL: resolveConfigURL(module), saving: false };
            sessions.set(module, state);
            try {
                let model;
                switch (initialModel === undefined) {
                    case true: {
                        const timer = setTimeout(() => state.controller.abort(), timeout);
                        try {
                            const response = await request(`${apiBase}/${encodeURIComponent(module)}`, {
                                method: "GET",
                                credentials: "omit",
                                cache: "no-store",
                                signal: state.controller.signal,
                                headers: { Accept: "application/json", "X-PreferencePanes-JSON": state.configURL },
                            });
                            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
                            model = await response.json();
                        } finally {
                            clearTimeout(timer);
                        }
                        break;
                    }
                    default:
                        model = initialModel;
                        break;
                }
                if (sessions.get(module) !== state) throw new Error("Module session was replaced");
                state.definition = model.definition;
                state.values = model.values;
                state.configURL = model.configURL ?? state.configURL;
                return snapshot(module);
            } catch (error) {
                if (sessions.get(module) === state) sessions.delete(module);
                throw error;
            }
        },
        snapshot,
        async readSettings(module) {
            const response = await send(module, "get", { scope: "settings" }, sessions.get(module)?.controller.signal, sessions.get(module)?.configURL);
            return response.status === 404 ? undefined : response.json();
        },
        async readCaches(module) {
            const response = await send(module, "get", { scope: "caches" }, sessions.get(module)?.controller.signal, sessions.get(module)?.configURL);
            return response.status === 404 ? undefined : response.json();
        },
        clearCaches: module => change(module, "delete", { scope: "caches" }, "clearCaches"),
        reset: module => change(module, "delete", { scope: "module" }, "reset"),
        leave(module) {
            sessions.get(module)?.controller.abort();
            sessions.delete(module);
        },
        set: (module, key, value) => change(module, "set", { key, value }, "write", key),
        remove: (module, key) => change(module, "delete", { key }, "delete", key),
    };
}
