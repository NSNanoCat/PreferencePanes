import { URL } from "@nsnanocat/url";
import { fetch as transport } from "@nsnanocat/util";
import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";
import { validatePathParts } from "./lib/settings-path.mjs";

const MISSING = Symbol("missing");

/**
 * PreferencePanes 后端 API，只处理模块数据和持久化请求。
 * PreferencePanes backend API handling only module data and persistence requests.
 */
class API {
    /**
     * 处理当前代理请求并将结果交给宿主。
     * Handle the current proxy request and deliver its result to the host.
     * @returns {Promise<void>} 响应已交给代理宿主 / Response delivered to the proxy host.
     */
    async run() {
        const request = globalThis.$request;
        let result;
        try {
            result = await this.handle(request);
        } catch (error) {
            console.error(`PreferencePanes: ${error.message}`);
            result = this.#response(request, error.status ?? 500, { error: error.message });
        }
        if (!result) done({});
        else done($app === "Quantumult X" ? result : { response: result });
    }

    /**
     * 处理 `/api/{module}` 及其动作，不接管页面或静态资源。
     * Handle `/api/{module}` and its actions without intercepting pages or static assets.
     * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
     * @returns {Promise<import("./index.js").SettingsResponse | undefined>} API 响应或未接管 / API response or pass-through.
     */
    async handle(request) {
        const url = new URL(request.url);
        const match = /^\/api\/([a-zA-Z0-9_-]+)(?:\/(get|set|delete))?\/?$/.exec(url.pathname);
        if (!match) return;
        const [, module, action] = match;
        const configURL = this.#configURL(request, url, module);
        switch (true) {
            case !action && request.method === "HEAD":
                return this.#probe(request, configURL);
            case !action && request.method === "GET":
                return this.#model(request, module, configURL);
            case Boolean(action) && request.method === "POST":
                return this.#action(request, module, action, configURL);
            default:
                return this.#response(request, 405, { error: "Use GET or HEAD for module reads, POST for module actions" });
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
            result = await transport({ url: configURL, method: "HEAD", timeout: 5000, headers: { Accept: "application/json" } });
        } catch (error) {
            return this.#response(request, 502, { error: error.message });
        }
        const version = this.#header(result.headers, "x-preferencepanes-version");
        return this.#response(request, result.statusCode ?? result.status, undefined, version ? { "X-PreferencePanes-Version": version } : {});
    }

    async #model(request, module, configURL) {
        const loaded = await this.#load(module, configURL);
        const values = {};
        for (const entry of loaded.entries) {
            const value = Storage.getItem(entry.id, MISSING);
            if (value !== MISSING) values[entry.id.slice(loaded.storageKey.length + 2)] = value;
        }
        return this.#response(request, 200, { module, boxjs: loaded.boxjs, values, configURL }, loaded.version ? { "X-PreferencePanes-Version": loaded.version } : {});
    }

    async #action(request, module, action, configURL) {
        const payload = this.#jsonBody(request);
        const target = await this.#load(module, configURL);
        switch (action) {
            case "get": {
                const value = Storage.getItem(payload?.scope ? this.#scopePath(target, payload.scope) : this.#storagePath(target, payload?.key), MISSING);
                return value === MISSING ? this.#response(request, 404, { error: "Stored path does not exist" }) : this.#response(request, 200, value);
            }
            case "set":
                if (!Object.hasOwn(payload ?? {}, "value")) throw Object.assign(new TypeError("A value is required"), { status: 400 });
                if (!Storage.setItem(this.#storagePath(target, payload.key), payload.value)) throw new Error("Storage write failed");
                return this.#response(request, 200, { saved: true });
            case "delete": {
                const path = payload?.scope ? this.#scopePath(target, payload.scope) : this.#storagePath(target, payload?.key);
                if (!Storage.removeItem(path)) throw new Error("Storage write failed");
                return this.#response(request, 200, { deleted: true });
            }
        }
    }

    async #load(module, configURL) {
        let result;
        try {
            result = await transport({ url: configURL, method: "GET", timeout: 5000, headers: { Accept: "application/json" } });
        } catch (error) {
            throw Object.assign(new Error(`Configuration request failed: ${error.message}`), { status: 502 });
        }
        const status = result.statusCode ?? result.status;
        if (status !== 200) throw Object.assign(new Error(`Configuration HTTP ${status}`), { status });
        try {
            const body = typeof result.body === "string" ? result.body : new TextDecoder().decode(result.body);
            const boxjs = JSON.parse(body);
            const apps = Array.isArray(boxjs) ? [{ settings: boxjs }] : (boxjs.apps ?? [boxjs]);
            if (!Array.isArray(apps)) throw new TypeError("Expected BoxJS apps array");
            const entries = [];
            let storageKey;
            for (const app of apps) {
                if (!app || !Array.isArray(app.settings)) throw new TypeError("Expected BoxJS settings array");
                for (const entry of app.settings) {
                    if (typeof entry.id !== "string") throw new TypeError("BoxJS settings require string IDs");
                    if (!entry.id.startsWith("@")) {
                        if (Array.isArray(boxjs)) throw new TypeError("BoxJS settings require @root.path IDs");
                        continue;
                    }
                    const [root, ...parts] = entry.id.slice(1).split(".");
                    if (!root || root.startsWith("@") || parts.length < 2) throw new TypeError("A BoxJS setting must be below a literal storage root and module");
                    validatePathParts(parts);
                    if (parts[0] !== module) continue;
                    if (storageKey && storageKey !== root) throw new TypeError(`A module must use one storage root: ${module}`);
                    storageKey = root;
                    entries.push(entry);
                }
            }
            if (!entries.length) throw new TypeError(`No BoxJS settings for module: ${module}`);
            return { boxjs, entries, module, storageKey, version: this.#header(result.headers, "x-preferencepanes-version") };
        } catch (error) {
            throw Object.assign(new Error(`Invalid BoxJS: ${error.message}`), { status: 422 });
        }
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

    #response(request, status, body, extraHeaders = {}) {
        return {
            status,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders },
            body: request.method === "HEAD" ? "" : JSON.stringify(body),
        };
    }

    #header(headers, name) {
        const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
        return entry?.[1] === undefined ? undefined : String(entry[1]).trim();
    }
}

new API().run();
