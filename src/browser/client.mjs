import { normalizeBoxJs, normalizeStoredValue, validValue } from "../lib/boxjs.mjs";

/**
 * 单个模块的临时会话；离开页面后丢弃。
 * Transient module session discarded when leaving the page.
 * @typedef {object} ModuleSession
 * @property {AbortController} controller 读取请求的取消控制器 / Abort controller for reads.
 * @property {import("../index.js").ModuleDefinition | null} definition 加载完成的配置，加载中为 null / Loaded configuration, or null while loading.
 * @property {import("./client.mjs").ModuleSnapshot["values"]} values 当前显示值 / Current display values.
 * @property {boolean} saving 是否正在写入 / Whether a mutation is in progress.
 */

/**
 * 创建页面会话缓存；打开时重读，选项操作仅在 HTTP 200 后更新缓存。
 * Create a page-session cache; reload on open and mutate cache only after HTTP 200.
 * @param {import("./client.mjs").PreferencesClientOptions} options 包内目录、请求与通知 / Internal catalog, requests and notifications.
 * @returns {import("./client.mjs").PreferencesClient} 通用客户端 / Generic client.
 */
export function createPreferencesClient({ catalog, fetch: request = globalThis.fetch.bind(globalThis), notify = () => {}, timeout = 10000 }) {
    /**
     * 模块会话表
     * Module session map.
     * @type {Map<string, ModuleSession>}
     */
    const sessions = new Map();
    /**
     * 用 form 发送完整存储键；读取 404 交给调用方处理。
     * Send a complete storage key as form data; callers handle missing reads.
     * @param {string} path 完整 @root.path / Complete @root.path.
     * @param {"get" | "set" | "delete"} action 存储操作 / Storage operation.
     * @param {unknown} body set 值，其它操作忽略 / Set value, ignored by other operations.
     * @param {AbortSignal | undefined} signal 会话取消信号 / Session cancellation signal.
     * @returns {Promise<Response>} 未消费正文的响应 / Response with an unread body.
     * @throws {Error} 非 200 且非数据 GET 404、超时、取消或网络错误 / Non-200 status except missing-data GETs, timeout, cancellation or network error.
     */
    async function send(path, action, body, signal) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (signal?.aborted) abort();
        signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, timeout);
        try {
            const response = await request(`/api/${action}`, {
                method: "POST",
                credentials: "omit",
                cache: "no-store",
                signal: controller.signal,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams([[path, action === "set" ? JSON.stringify(body) : ""]]).toString(),
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
     * @throws {Error} 模块未完成加载 / Module has not finished loading.
     */
    const snapshot = module => {
        const state = sessions.get(module);
        if (!state?.definition) throw new Error("Open the module first");
        return structuredClone({ definition: state.definition, values: state.values });
    };
    /**
     * 串行修改单键，仅成功后更新仍存活的会话。
     * Serialize single-key mutations and update a still-active session only after success.
     * @param {string} module 已打开模块 / Open module.
     * @param {string} key 完整点分字段路径 / Complete dotted field path.
     * @param {"set" | "delete"} action 写入或删除 / Write or delete.
     * @param {unknown} value 写入值，删除时忽略 / Write value, ignored for deletion.
     * @param {"write" | "delete" | "clearCaches" | "reset"} [operation] 操作类型 / Operation kind.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     * @throws {Error} 会话、字段、值或请求错误 / Session, field, value or request error.
     */
    async function change(module, key, action, value, operation = action === "set" ? "write" : "delete") {
        const state = sessions.get(module);
        if (!state?.definition) throw new Error("Open the module first");
        if (state.saving) throw new Error("A settings write is already in progress");
        const field = state.definition.fields.find(field => field.key === key);
        state.saving = true;
        try {
            if ((operation === "write" || operation === "delete") && (!field || (action === "set" && !validValue(field, value)))) throw new TypeError("Invalid setting value");
            await send(`@${state.definition.storageKey}.${key}`, action, value);
            if (sessions.get(module) === state) {
                switch (operation) {
                    case "write":
                        state.values[key] = structuredClone(value);
                        break;
                    case "delete":
                    case "clearCaches":
                    case "reset":
                        for (const candidate of state.definition.fields) {
                            if (candidate.key !== key && !candidate.key.startsWith(`${key}.`)) continue;
                            delete state.values[candidate.key];
                            if (Object.hasOwn(candidate, "defaultValue")) state.values[candidate.key] = structuredClone(candidate.defaultValue);
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
         * 从已导入的 JSON 创建新会话，只读取一次设置值。
         * Create a session from imported JSON and read stored settings once.
         * @param {string} module 模块标识 / Module identifier.
         * @returns {Promise<import("./client.mjs").ModuleSnapshot>} 新快照 / New snapshot.
         * @throws {Error} 读取失败、会话被替换或写入尚未完成 / Read failure, replaced session or unfinished write.
         */
        async open(module) {
            const binding = catalog.modules.get(module);
            if (!binding) throw new TypeError(`No BoxJS settings for module: ${module}`);
            const previous = sessions.get(module);
            if (previous?.saving) throw new Error("Cannot refresh while saving");
            previous?.controller.abort();
            const state = { controller: new AbortController(), definition: null, values: {}, saving: false };
            sessions.set(module, state);
            try {
                const definition = normalizeBoxJs(catalog.select(module), module);
                const response = await send(`@${definition.storageKey}.${definition.settingsPath.join(".")}`, "get", undefined, state.controller.signal);
                let subtree = response.status === 404 ? {} : await response.json();
                if (typeof subtree === "string") subtree = JSON.parse(subtree);
                if (!subtree || typeof subtree !== "object" || Array.isArray(subtree)) throw new TypeError("Expected a settings subtree object");
                if (sessions.get(module) !== state) throw new Error("Module session was replaced");
                state.definition = definition;
                for (const field of definition.fields) {
                    const stored = field.key
                        .split(".")
                        .slice(definition.settingsPath.length)
                        .reduce((parent, part) => Object(parent)[part], subtree);
                    const value = stored === undefined ? field.defaultValue : stored;
                    if (value !== undefined) state.values[field.key] = normalizeStoredValue(field, value);
                }
                return snapshot(module);
            } catch (error) {
                if (sessions.get(module) === state) sessions.delete(module);
                throw error;
            }
        },
        snapshot,
        /**
         * 按需读取模块 Caches，不自动读取其它设置。
         * Read module Caches on demand without refreshing other settings.
         * @param {string} module 已打开的模块 / Open module.
         * @returns {Promise<unknown>} 缓存值，缺失为 undefined / Cache value, or undefined when absent.
         */
        async readCaches(module) {
            const state = sessions.get(module);
            if (!state?.definition) throw new Error("Open the module first");
            const response = await send(`@${state.definition.storageKey}.${module}.Caches`, "get", undefined, state.controller.signal);
            return response.status === 404 ? undefined : response.json();
        },
        /**
         * 删除整个 Caches 节点，成功后不追加 GET。
         * Delete the entire Caches node without a follow-up GET.
         * @param {string} module 已打开模块 / Open module.
         * @returns {Promise<void>} 清理完成 / Cleanup completion.
         */
        clearCaches: module => change(module, `${module}.Caches`, "delete", undefined, "clearCaches"),
        /**
         * 删除整个模块持久化节点，以当前 BoxJS 默认值重置页面缓存。
         * Delete module persistence and reset the page cache using current BoxJS defaults.
         * @param {string} module 已打开模块 / Open module.
         * @returns {Promise<void>} 重置完成 / Reset completion.
         */
        reset: module => change(module, module, "delete", undefined, "reset"),
        /**
         * 取消读取并清除会话，不撤销已发送的写入。
         * Abort reads and clear the session without undoing dispatched writes.
         * @param {string} module 模块标识 / Module identifier.
         * @returns {void} 无返回值 / No return value.
         */
        leave(module) {
            sessions.get(module)?.controller.abort();
            sessions.delete(module);
        },
        /**
         * 写入单键并更新当前会话。
         * Write one key and update the current session.
         * @param {string} module 已打开模块 / Open module.
         * @param {string} key 点分字段路径 / Dotted field path.
         * @param {import("../index.js").SettingsScalar | import("../index.js").SettingsScalar[]} value 字段值 / Field value.
         * @returns {Promise<void>} 写入完成 / Write completion.
         */
        set: (module, key, value) => change(module, key, "set", value),
        /**
         * 删除单键覆盖值并显示默认值。
         * Delete one override and display its default value.
         * @param {string} module 已打开模块 / Open module.
         * @param {string} key 点分字段路径 / Dotted field path.
         * @returns {Promise<void>} 删除完成 / Delete completion.
         */
        remove: (module, key) => change(module, key, "delete"),
    };
}
