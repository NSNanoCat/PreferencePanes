import { fetch as transport } from "@nsnanocat/util";
import { BoxJS } from "./BoxJS.mjs";
import { response } from "./lib/response.mjs";
import { Store } from "./Store.mjs";

/**
 * 代理侧模块 API：取得 BoxJS、映射存储路径并执行持久化操作。
 * Proxy-side module API: retrieve BoxJS, map storage paths and execute persistence operations.
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
     * 处理模块探测、模块数据和模块持久化操作。
     * Handle module probes, module data and module persistence operations.
     * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
     * @param {URL} url 已解析地址 / Parsed URL.
     * @returns {Promise<import("./index.js").SettingsResponse | undefined>} 响应 / Response.
     */
    async handle(request, url) {
        const match = /^\/api\/([a-zA-Z0-9_-]+)(?:\/(get|set|delete))?\/?$/.exec(url.pathname);
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
                    return response(request, 405, { error: "Use GET or HEAD for module reads, POST for module actions" });
            }
        } catch (error) {
            return response(request, error.status ?? 500, { error: error.message });
        }
    }

    #configURL(request, url, module) {
        const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        const source = headers["x-preferencepanes-json"] ?? `/configs/${module}`;
        if (/^https?:\/\//i.test(source)) return source;
        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(source)) throw Object.assign(new TypeError("BoxJS resources must use HTTP(S) URLs"), { status: 400 });
        return `${url.origin}/${source.replace(/^\/+/, "")}`;
    }

    async #probe(request, configURL) {
        let result;
        try {
            result = await this.#fetch({ url: configURL, method: "HEAD", timeout: 5000, headers: { Accept: "application/json" } });
        } catch (error) {
            return response(request, 502, { error: error.message });
        }
        const version = header(result.headers, "x-preferencepanes-version");
        return response(request, result.statusCode ?? result.status, undefined, "application/json", version ? { "X-PreferencePanes-Version": version } : {});
    }

    async #model(request, module, configURL) {
        const loaded = await this.#load(module, configURL);
        return response(request, 200, { module, boxjs: loaded.boxjs, values: this.#values(loaded.target), configURL }, "application/json", loaded.version ? { "X-PreferencePanes-Version": loaded.version } : {});
    }

    async #action(request, module, action, configURL) {
        const payload = this.#jsonBody(request);
        const { target } = await this.#load(module, configURL);
        switch (action) {
            case "get":
                return this.#get(request, target, payload);
            case "set":
                return this.#set(request, target, payload);
            case "delete":
                return this.#delete(request, target, payload);
        }
    }

    async #load(module, configURL) {
        let result;
        try {
            result = await this.#fetch({ url: configURL, method: "GET", timeout: 5000, headers: { Accept: "application/json" } });
        } catch (error) {
            throw Object.assign(new Error(`Configuration request failed: ${error.message}`), { status: 502 });
        }
        const status = result.statusCode ?? result.status;
        if (status !== 200) throw Object.assign(new Error(`Configuration HTTP ${status}`), { status });
        try {
            const body = typeof result.body === "string" ? result.body : new TextDecoder().decode(result.body);
            const boxjs = JSON.parse(body);
            const target = new BoxJS(boxjs).modules.get(module);
            if (!target) throw new TypeError(`No BoxJS settings for module: ${module}`);
            return { boxjs, target, version: header(result.headers, "x-preferencepanes-version") };
        } catch (error) {
            throw Object.assign(new Error(`Invalid BoxJS: ${error.message}`), { status: 422 });
        }
    }

    #values(target) {
        let stored = this.#store.read(`@${target.storageKey}.${target.module}`);
        if (typeof stored === "string") stored = JSON.parse(stored);
        const values = {};
        for (const entry of target.entries) {
            const key = entry.id.slice(1).split(".").slice(1).join(".");
            const relative = key.split(".").slice(1);
            let value = stored;
            for (const part of relative) value = value == null ? undefined : value[part];
            if (value !== undefined) values[key] = value;
        }
        return values;
    }

    #jsonBody(request) {
        const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        if (headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") throw Object.assign(new TypeError("Expected application/json"), { status: 415 });
        if (typeof request.body !== "string" || request.body.length > 65536) throw Object.assign(new TypeError("Expected a JSON body up to 65536 characters"), { status: 400 });
        try {
            return JSON.parse(request.body);
        } catch (error) {
            throw Object.assign(error, { status: 400 });
        }
    }

    #storagePath(target, key) {
        if (typeof key !== "string") throw Object.assign(new TypeError("A BoxJS field path is required"), { status: 400 });
        const path = `@${target.storageKey}.${key}`;
        if (!target.entries.some(entry => entry.id === path)) throw Object.assign(new TypeError(`Unknown BoxJS field: ${key}`), { status: 400 });
        return path;
    }

    #scopePath(target, scope) {
        switch (scope) {
            case "settings":
                return `@${target.storageKey}.${target.module}.Settings`;
            case "caches":
                return `@${target.storageKey}.${target.module}.Caches`;
            case "module":
                return `@${target.storageKey}.${target.module}`;
            default:
                throw Object.assign(new TypeError("Scope must be settings, caches or module"), { status: 400 });
        }
    }

    #get(request, target, payload) {
        const value = this.#store.read(payload?.scope ? this.#scopePath(target, payload.scope) : this.#storagePath(target, payload?.key));
        return value === undefined ? response(request, 404, { error: "Stored path does not exist" }) : response(request, 200, value);
    }

    #set(request, target, payload) {
        if (!Object.hasOwn(payload ?? {}, "value")) throw Object.assign(new TypeError("A value is required"), { status: 400 });
        if (!this.#store.write(this.#storagePath(target, payload.key), payload.value)) throw new Error("Storage write failed");
        return response(request, 200, { saved: true });
    }

    #delete(request, target, payload) {
        const path = payload?.scope ? this.#scopePath(target, payload.scope) : this.#storagePath(target, payload?.key);
        if (!this.#store.remove(path)) throw new Error("Storage write failed");
        return response(request, 200, { deleted: true });
    }
}

/**
 * 按名称读取不区分大小写的响应头。
 * Read a response header by a case-insensitive name.
 * @param {Record<string, unknown>} [headers] 响应头 / Response headers.
 * @param {string} name 小写名称 / Lowercase name.
 * @returns {string | undefined} 字符串值 / String value.
 */
function header(headers, name) {
    headers = headers ?? {};
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
    return entry?.[1] === undefined ? undefined : String(entry[1]).trim();
}
