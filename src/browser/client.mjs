import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { normalizeBoxJs, normalizeStoredValue, validValue } from "../lib/boxjs.mjs";
import { validatePathParts } from "../lib/settings-path.mjs";

/**
 * 创建页面会话缓存；打开时重读，选项操作仅在 HTTP 200 后更新缓存。
 * Create a page-session cache; reload on open and mutate cache only after HTTP 200.
 * @param {import("./index.js").PreferencesClientOptions} options 请求与通知 / Requests and notifications.
 * @returns {import("./index.js").PreferencesClient} 通用客户端 / Generic client.
 */
export function createPreferencesClient({ fetch: request = globalThis.fetch.bind(globalThis), notify = () => {}, timeout = 10000 } = {}) {
  const sessions = new Map();
  async function send(path, method, body, signal, resource = false) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeout);
    try {
      const response = await request(path, {
        method,
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: resource ? {} : { "X-Settings-Client": "1", ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      return response;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  const configPath = (module) => {
    validatePathParts([module]);
    return `/configs/${encodeURIComponent(module)}`;
  };
  const snapshot = (module) => {
    const state = sessions.get(module);
    if (!state?.definition) throw new Error("Open the module first");
    return structuredClone({ definition: state.definition, values: state.values });
  };
  async function change(module, key, method, value) {
    const state = sessions.get(module);
    if (!state?.definition) throw new Error("Open the module first");
    if (state.saving) throw new Error("A settings write is already in progress");
    const field = state.definition.fields.find((field) => field.key === key);
    state.saving = true;
    try {
      if (!field || (method === "POST" && !validValue(field, value))) throw new TypeError("Invalid setting value");
      await send(`/api/${key.split(".").map(encodeURIComponent).join("/")}`, method, value);
      if (sessions.get(module) === state) {
        if (method === "DELETE") {
          delete state.values[key];
          if (Object.hasOwn(field, "defaultValue")) state.values[key] = structuredClone(field.defaultValue);
        } else state.values[key] = structuredClone(value);
      }
      notify({ kind: "success", operation: method === "DELETE" ? "delete" : "write", module, key });
    } catch (error) {
      notify({ kind: "error", operation: method === "DELETE" ? "delete" : "write", module, key, message: error.message });
      throw error;
    } finally {
      state.saving = false;
    }
  }
  return {
    async probe(module) {
      try {
        await send(configPath(module), "HEAD", undefined, undefined, true);
        return true;
      } catch {
        return false;
      }
    },
    async open(module) {
      const previous = sessions.get(module);
      if (previous?.saving) throw new Error("Cannot refresh while saving");
      previous?.controller.abort();
      const state = { controller: new AbortController(), definition: null, values: {}, saving: false };
      sessions.set(module, state);
      try {
        const definition = normalizeBoxJs(
          await (await send(configPath(module), "GET", undefined, state.controller.signal, true)).json(),
          module,
        );
        if (definition.settingsPath.length < 2) throw new TypeError("BoxJS fields must share a settings subtree below the module root");
        const subtree = await (
          await send(`/api/${definition.settingsPath.map(encodeURIComponent).join("/")}/`, "GET", undefined, state.controller.signal)
        ).json();
        if (!subtree || typeof subtree !== "object" || Array.isArray(subtree)) throw new TypeError("Expected a settings subtree object");
        if (sessions.get(module) !== state) throw new Error("Module session was replaced");
        state.definition = definition;
        for (const field of definition.fields) {
          const value = _.get(subtree, field.key.split(".").slice(definition.settingsPath.length), field.defaultValue);
          if (value !== undefined) state.values[field.key] = normalizeStoredValue(field, value);
        }
        return snapshot(module);
      } catch (error) {
        if (sessions.get(module) === state) sessions.delete(module);
        throw error;
      }
    },
    snapshot,
    leave(module) {
      sessions.get(module)?.controller.abort();
      sessions.delete(module);
    },
    set: (module, key, value) => change(module, key, "POST", value),
    remove: (module, key) => change(module, key, "DELETE"),
  };
}
