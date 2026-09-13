/**
 * 创建单模块页面客户端；只调用模块 API，不读取或解析 BoxJS。
 * Create a single-module page client that only calls the module API and never reads or parses BoxJS.
 * @param {import("./client.mjs").PreferencesClientOptions} options API 模型、请求与通知 / API model, requests and notifications.
 * @returns {import("./client.mjs").PreferencesClient} 页面客户端 / Page client.
 */
export function createPreferencesClient({ model, definition, fetch: request = globalThis.fetch.bind(globalThis), notify = () => {}, timeout = 10000 }) {
    const { module, configURL } = model;
    const session = new AbortController();
    const values = structuredClone(model.values);
    let saving = false;

    /**
     * 向模块 API 发送 JSON 动作。
     * Send a JSON action to the module API.
     * @param {"get" | "set" | "delete"} action 模块动作 / Module action.
     * @param {unknown} payload JSON 请求体 / JSON request body.
     * @returns {Promise<Response>} 原始响应 / Raw response.
     */
    async function send(action, payload) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (session.signal.aborted) abort();
        session.signal.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(abort, timeout);
        try {
            const response = await request(`/api/${encodeURIComponent(module)}/${action}`, {
                method: "POST",
                credentials: "omit",
                cache: "no-store",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", "X-PreferencePanes-JSON": configURL },
                body: JSON.stringify(payload),
            });
            if (response.status !== 200 && !(action === "get" && response.status === 404)) throw new Error(`HTTP ${response.status}`);
            return response;
        } finally {
            clearTimeout(timer);
            session.signal.removeEventListener("abort", abort);
        }
    }

    /**
     * 执行写入动作；成功后只更新当前页面值。
     * Execute a mutation and update only the current page values after success.
     * @param {"set" | "delete"} action API 动作 / API action.
     * @param {unknown} payload JSON 请求体 / JSON request body.
     * @param {"write" | "delete" | "clearCaches" | "reset"} operation 通知操作 / Notification operation.
     * @param {string} [key] 字段路径 / Field path.
     * @returns {Promise<void>} 操作完成 / Operation completion.
     */
    async function change(action, payload, operation, key) {
        if (saving) throw new Error("A settings write is already in progress");
        saving = true;
        try {
            await send(action, payload);
            switch (operation) {
                case "write":
                    values[key] = structuredClone(payload.value);
                    break;
                case "delete": {
                    const field = definition.fields.find(candidate => candidate.key === key);
                    delete values[key];
                    if (field && Object.hasOwn(field, "defaultValue")) values[key] = structuredClone(field.defaultValue);
                    break;
                }
                case "clearCaches":
                    break;
                case "reset":
                    for (const field of definition.fields) {
                        delete values[field.key];
                        if (Object.hasOwn(field, "defaultValue")) values[field.key] = structuredClone(field.defaultValue);
                    }
                    break;
            }
            notify({ kind: "success", operation, module, key });
        } catch (error) {
            notify({ kind: "error", operation, module, key, message: error.message });
            throw error;
        } finally {
            saving = false;
        }
    }

    return {
        snapshot: () => structuredClone({ definition, values }),
        async readSettings() {
            const response = await send("get", { scope: "settings" });
            return response.status === 404 ? undefined : response.json();
        },
        async readCaches() {
            const response = await send("get", { scope: "caches" });
            return response.status === 404 ? undefined : response.json();
        },
        clearCaches: () => change("delete", { scope: "caches" }, "clearCaches"),
        reset: () => change("delete", { scope: "module" }, "reset"),
        leave: () => session.abort(),
        set: (key, value) => change("set", { key, value }, "write", key),
        remove: key => change("delete", { key }, "delete", key),
    };
}
