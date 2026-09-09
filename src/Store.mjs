import { URL } from "@nsnanocat/url";
import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";
import { response } from "./lib/response.mjs";
import { parseSettingsPathname } from "./lib/settings-path.mjs";

/**
 * 根据 BoxJS 目录桥接持久化存储，不下载配置或解析控件。
 * Bridge persistence using the BoxJS catalog without downloading configuration or interpreting controls.
 */
export class Store {
    #catalog;

    /**
     * 复用包内已解析的目录，构造时不访问网络或存储。
     * Reuse the parsed internal catalog without network or persistence access during construction.
     * @param {import("./BoxJS.mjs").BoxJS} catalog BoxJS 路径目录 / BoxJS path catalog.
     */
    constructor(catalog) {
        this.#catalog = catalog;
    }

    /**
     * GET 返回指定值，POST 替换指定值，DELETE 删除指定键或整个模块。
     * GET returns a value, POST replaces it, and DELETE removes a key or the entire module.
     * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
     * @param {URL} [url] 包内复用的已解析地址 / Parsed URL reused within the package.
     * @returns {Promise<import("./index.js").SettingsResponse | undefined>} 响应或非接管请求 / Response, or undefined for an unhandled request.
     */
    async handle(request, url = new URL(request.url)) {
        if (!url.pathname.startsWith("/api/")) return;
        const reply = (status, data) => response(request, status, data);
        let parts;
        try {
            parts = parseSettingsPathname(url.pathname);
        } catch (error) {
            return reply(400, { error: error.message });
        }
        const binding = this.#catalog.modules.get(parts[0]);
        if (!binding) return reply(404, { error: "Module is not declared in BoxJS" });
        const requestHeaders = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
        if (requestHeaders["x-settings-client"] !== "1" || (requestHeaders.origin && requestHeaders.origin !== url.origin)) return reply(403, { error: "Forbidden settings client" });
        let value;
        switch (request.method) {
            case "HEAD":
                return reply(200, undefined);
            case "GET":
            case "DELETE":
                break;
            case "POST":
                if (requestHeaders["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415, { error: "Expected application/json" });
                if (typeof request.body !== "string") return reply(400, { error: "Expected a JSON string body" });
                if (request.body.length > 65536) return reply(413, { error: "Body exceeds 65536 UTF-16 code units" });
                try {
                    value = JSON.parse(request.body);
                } catch {
                    return reply(400, { error: "Invalid JSON" });
                }
                break;
            default:
                return { ...reply(405, { error: "Method not allowed" }), headers: { ...reply(405).headers, Allow: "HEAD, GET, POST, DELETE" } };
        }
        try {
            const root = Storage.getItem(binding.storageKey, {});
            if (!isRecord(root)) throw new TypeError("stored root must be an object");
            const parent = storageParent(root, parts, request.method === "POST");
            const key = parts.at(-1);
            switch (request.method) {
                case "GET": {
                    const result = parent ? _.get(parent, [key]) : undefined;
                    return result === undefined ? reply(404, { error: "Stored path does not exist" }) : reply(200, result);
                }
                case "POST":
                    _.set(parent, [key], value);
                    break;
                case "DELETE":
                    if (parent) _.unset(parent, [key]);
                    break;
            }
            if (!Storage.setItem(binding.storageKey, root)) throw new Error("Storage write failed");
            return reply(200, request.method === "POST" ? { saved: true } : { deleted: true });
        } catch (error) {
            return reply(500, { error: error.message });
        }
    }
}

/**
 * 判断根节点是否为普通对象。
 * Determine whether a root node is a plain object.
 * @param {unknown} value 待检查值 / Value to inspect.
 * @returns {boolean} 是否为普通对象 / Whether this is a plain object.
 */
function isRecord(value) {
    return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * 遍历父路径，兼容旧存储中 JSON 字符串形式的中间节点。
 * Traverse parents, supporting legacy intermediate nodes serialized as JSON strings.
 * @param {Record<string, unknown>} root 存储根 / Storage root.
 * @param {string[]} parts 完整路径 / Complete path.
 * @param {boolean} create 是否创建缺失节点 / Whether to create missing parents.
 * @returns {object | undefined} 父节点，缺失且不创建时为 undefined / Parent, or undefined when absent and not creating.
 * @throws {TypeError} 无法继续遍历标量节点 / A scalar node cannot be traversed.
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
