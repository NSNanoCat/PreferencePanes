import { fetch as transport } from "@nsnanocat/util";
import { BoxJS } from "./BoxJS.mjs";
import { normalizeBoxJs, normalizeStoredValue } from "./lib/boxjs.mjs";
import { response } from "./lib/response.mjs";
import { Store } from "./Store.mjs";

/**
 * 代理侧模块 API：加载 BoxJS、生成模型并执行持久化操作。
 * Proxy-side module API: load BoxJS, create a model and execute persistence operations.
 */
export class ModuleApi {
    #fetch;
    #store;

    /**
     * @param {{fetch?: typeof transport, store?: Store}} [options] 依赖 / Dependencies.
     */
    constructor({ fetch = transport, store = new Store() } = {}) {
        this.#fetch = fetch;
        this.#store = store;
    }

    /**
     * 处理模块探测、模块模型和模块持久化操作。
     * Handle module probes, module models and module persistence operations.
     * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
     * @param {URL} url 已解析地址 / Parsed URL.
     * @returns {Promise<import("./index.js").SettingsResponse | undefined>} 响应 / Response.
     */
    async handle(request, url) {
        const match = /^\/api\/module\/([a-zA-Z0-9_-]+)(?:\/(get|set|delete))?\/?$/.exec(url.pathname);
        if (!match) return;
        const [, module, action] = match;
        try {
            const configURL = this.#configURL(request, url, module);
            switch (true) {
                case !action && request.method === "HEAD":
                    return await this.#probe(request, configURL);
                case !action && request.method === "GET":
                    return await this.#model(request, module, configURL);
                case Boolean(action) && request.method === "POST":
                    return await this.#action(request, module, action, configURL);
                default:
                    return response(request, 405, { error: "Use GET or HEAD for module reads, POST for mutations" });
            }
        } catch (error) {
            const status = Number.isInteger(error.status) ? error.status : error instanceof SyntaxError || error instanceof TypeError ? 400 : 500;
            return response(request, status, { error: error.message });
        }
    }

    #configURL(request, url, module) {
        const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        const source = headers["x-preferencepanes-json"] ?? `/configs/${module}`;
        return new URL(source, url).href;
    }

    async #probe(request, configURL) {
        let result;
        try {
            result = await this.#fetch({ url: configURL, method: "HEAD", timeout: 5000, headers: { Accept: "application/json" } });
        } catch (error) {
            return response(request, 502, { error: error.message });
        }
        const status = result.statusCode ?? result.status;
        const headers = Object.fromEntries(Object.entries(result.headers ?? {}).filter(([key]) => key.toLowerCase() === "x-preferencepanes-version"));
        const version = Object.values(headers)[0];
        return response(request, status, undefined, "application/json", version ? { "X-PreferencePanes-Version": String(version) } : {});
    }

    async #model(request, module, configURL) {
        const definition = await this.#definition(module, configURL);
        return response(request, 200, { module, definition, values: this.#values(definition), configURL });
    }

    async #action(request, module, action, configURL) {
        const payload = this.#jsonBody(request);
        const definition = await this.#definition(module, configURL);
        switch (action) {
            case "get":
                return this.#get(request, definition, payload);
            case "set":
                return this.#set(request, definition, payload);
            case "delete":
                return this.#delete(request, definition, payload);
            default:
                return response(request, 404, { error: "Unknown module action" });
        }
    }

    async #definition(module, configURL) {
        let result;
        try {
            result = await this.#fetch({ url: configURL, method: "GET", timeout: 5000, headers: { Accept: "application/json" } });
        } catch (error) {
            throw Object.assign(new Error(`Configuration request failed: ${error.message}`), { status: 502 });
        }
        const status = result.statusCode ?? result.status;
        if (status !== 200) throw Object.assign(new Error(`Configuration HTTP ${status}`), { status });
        const body = typeof result.body === "string" ? result.body : new TextDecoder().decode(result.body);
        return normalizeBoxJs(new BoxJS(JSON.parse(body)), module);
    }

    #values(definition) {
        const stored = this.#store.read(`@${definition.storageKey}.${definition.settingsPath.join(".")}`);
        const values = {};
        for (const field of definition.fields) {
            const relative = field.key.split(".").slice(definition.settingsPath.length);
            let value = stored;
            for (const part of relative) value = value == null ? undefined : value[part];
            if (value === undefined) value = field.defaultValue;
            if (value !== undefined) values[field.key] = normalizeStoredValue(field, value);
        }
        return values;
    }

    #jsonBody(request) {
        const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        if (headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") throw new TypeError("Expected application/json");
        if (typeof request.body !== "string" || request.body.length > 65536) throw new TypeError("Expected a JSON body up to 65536 characters");
        return JSON.parse(request.body);
    }

    #storagePath(definition, key) {
        if (typeof key !== "string") throw new TypeError("A BoxJS field path is required");
        const field = definition.fields.find(candidate => candidate.key === key);
        if (!field) throw new TypeError(`Unknown BoxJS field: ${key}`);
        return `@${definition.storageKey}.${field.key}`;
    }

    #scopePath(definition, scope) {
        switch (scope) {
            case "settings":
                return `@${definition.storageKey}.${definition.settingsPath.join(".")}`;
            case "caches":
                return `@${definition.storageKey}.${definition.module}.Caches`;
            case "module":
                return `@${definition.storageKey}.${definition.module}`;
            default:
                throw new TypeError("Scope must be settings, caches or module");
        }
    }

    #get(request, definition, payload) {
        const path = payload?.scope ? this.#scopePath(definition, payload.scope) : this.#storagePath(definition, payload?.key);
        const value = this.#store.read(path);
        return value === undefined ? response(request, 404, { error: "Stored path does not exist" }) : response(request, 200, value);
    }

    #set(request, definition, payload) {
        const path = this.#storagePath(definition, payload?.key);
        if (!Object.hasOwn(payload ?? {}, "value")) throw new TypeError("A value is required");
        if (!this.#store.write(path, payload.value)) throw new Error("Storage write failed");
        return response(request, 200, { saved: true });
    }

    #delete(request, definition, payload) {
        const path = payload?.scope ? this.#scopePath(definition, payload.scope) : this.#storagePath(definition, payload?.key);
        if (!this.#store.remove(path)) throw new Error("Storage write failed");
        return response(request, 200, { deleted: true });
    }
}
