import { URL } from "@nsnanocat/url";
import { fetch as transport } from "@nsnanocat/util";
import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";
import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";
import { validatePathParts } from "./lib/settings-path.mjs";

/**
 * PreferencePanes 后端 API，只转发模块配置并提供通用持久化操作。
 * PreferencePanes backend API only relaying module configurations and providing generic persistence operations.
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
     * 处理模块配置 API 与固定存储动作，不接管页面或静态资源。
     * Handle module configuration APIs and fixed storage actions without intercepting pages or static assets.
     * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
     * @returns {Promise<import("./index.js").SettingsResponse | undefined>} API 响应或未接管 / API response or pass-through.
     */
    async handle(request) {
        const url = new URL(request.url);
        const action = /^\/api\/(get|set|delete)\/?$/.exec(url.pathname)?.[1];
        if (action) return this.#store(request, action);
        const module = /^\/api\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname)?.[1];
        if (!module) return;
        if (!["HEAD", "GET"].includes(request.method)) return this.#response(request, 405, { error: "Use GET or HEAD for module configuration" });
        return this.#configuration(request, `${url.origin}/configs/${module}`);
    }

    /**
     * 从同源业务配置响应模块探测或原始 BoxJS JSON。
     * Respond to a module probe or raw BoxJS JSON from the same-origin business configuration.
     * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
     * @param {string} configuration 同源配置地址 / Same-origin configuration URL.
     * @returns {Promise<import("./index.js").SettingsResponse>} 配置响应 / Configuration response.
     */
    async #configuration(request, configuration) {
        let result;
        try {
            result = await transport({ url: configuration, method: request.method, timeout: 5000, headers: { Accept: "application/json" } });
        } catch (error) {
            return this.#response(request, 502, { error: error.message });
        }
        const version = this.#header(result.headers, "x-preferencepanes-version");
        const contentType = this.#header(result.headers, "content-type") ?? "application/json; charset=utf-8";
        return {
            status: result.statusCode ?? result.status,
            headers: { "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(version ? { "X-PreferencePanes-Version": version } : {}) },
            body: request.method === "HEAD" ? "" : typeof result.body === "string" ? result.body : new TextDecoder().decode(result.body),
        };
    }

    /**
     * 使用唯一 form 字段中的完整 @root.path 执行存储操作。
     * Execute a storage operation using the complete @root.path from the sole form field.
     * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
     * @param {"get" | "set" | "delete"} action 存储动作 / Storage action.
     * @returns {import("./index.js").SettingsResponse} 操作响应 / Operation response.
     */
    #store(request, action) {
        const reply = (status, data) => this.#response(request, status, data);
        if (request.method !== "POST") return reply(405, { error: "Use POST with a form body" });
        const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        if (headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return reply(415, { error: "Expected application/x-www-form-urlencoded" });
        if (typeof request.body !== "string" || request.body.length > 65536) return reply(400, { error: "Expected a form body up to 65536 characters" });
        let parts, value;
        try {
            const fields = request.body.split("&");
            if (fields.length !== 1) throw new TypeError("Send exactly one storage key");
            const separator = fields[0].indexOf("=");
            if (separator < 0) throw new TypeError("Expected @root.path=value");
            const key = decodeURIComponent(fields[0].slice(0, separator).replace(/\+/g, " "));
            value = decodeURIComponent(fields[0].slice(separator + 1).replace(/\+/g, " "));
            if (!key.startsWith("@")) throw new TypeError("Storage keys must start with @");
            parts = validatePathParts(key.slice(1).split("."));
            if (parts.length < 2) throw new TypeError("Specify a storage root and child path");
        } catch (error) {
            return reply(400, { error: error.message });
        }
        if (action === "set") {
            try {
                value = JSON.parse(value);
            } catch (error) {
                if (!(error instanceof SyntaxError)) throw error;
            }
        }
        const [storageKey, ...path] = parts;
        try {
            const root = Storage.getItem(storageKey, {});
            if (!isRecord(root)) throw new TypeError("Stored root must be an object");
            const parent = storageParent(root, path, action === "set");
            const key = path.at(-1);
            switch (action) {
                case "get": {
                    const result = parent ? _.get(parent, [key]) : undefined;
                    return result === undefined ? reply(404, { error: "Stored path does not exist" }) : reply(200, result);
                }
                case "set":
                    _.set(parent, [key], value);
                    break;
                case "delete":
                    if (parent) _.unset(parent, [key]);
                    break;
            }
            if (!Storage.setItem(storageKey, root)) throw new Error("Storage write failed");
            return reply(200, action === "set" ? { saved: true } : { deleted: true });
        } catch (error) {
            return reply(500, { error: error.message });
        }
    }

    #response(request, status, body) {
        return {
            status,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
            body: request.method === "HEAD" ? "" : JSON.stringify(body),
        };
    }

    #header(headers, name) {
        const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
        return entry?.[1] === undefined ? undefined : String(entry[1]).trim();
    }
}

/**
 * 判断存储根是否为普通对象。
 * Determine whether a storage root is a plain object.
 * @param {unknown} value 待检查值 / Value to inspect.
 * @returns {boolean} 是否为普通对象 / Whether this is a plain object.
 */
function isRecord(value) {
    return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * 遍历父路径，并解码旧存储中的 JSON 字符串中间节点。
 * Traverse parent paths and decode legacy intermediate nodes stored as JSON strings.
 * @param {Record<string, unknown>} root 存储根 / Storage root.
 * @param {string[]} parts 完整路径 / Complete path.
 * @param {boolean} create 是否创建缺失节点 / Whether to create missing parents.
 * @returns {object | undefined} 父节点或 undefined / Parent node or undefined.
 */
function storageParent(root, parts, create) {
    let parent = root;
    for (const part of parts.slice(0, -1)) {
        let next = _.get(parent, [part]);
        switch (typeof next) {
            case "undefined":
                if (!create) return;
                next = {};
                break;
            case "string":
                next = JSON.parse(next);
                break;
            default:
                break;
        }
        if (!isRecord(next) && !Array.isArray(next)) throw new TypeError("Stored parent is not an object or array");
        _.set(parent, [part], next);
        parent = next;
    }
    return parent;
}

new API().run();
