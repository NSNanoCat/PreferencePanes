import { URL } from "@nsnanocat/url";
import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";
import { response } from "./lib/response.mjs";
import { validatePathParts } from "./lib/settings-path.mjs";

/**
 * 无配置绑定的本地存储桥接；form 字段名就是完整 @root.path。
 * Unbound local storage bridge; the form field name is the complete @root.path.
 */
export class Store {
    /**
     * POST /api/get、set、delete；不下载配置、不解析控件、不鉴权。
     * POST /api/get, set or delete without config downloads, control parsing or authentication.
     * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
     * @param {URL} [url] 已解析地址 / Parsed URL.
     * @returns {Promise<import("./index.js").SettingsResponse | undefined>} 操作结果 / Operation result.
     */
    async handle(request, url = new URL(request.url)) {
        if (!url.pathname.startsWith("/api/")) return;
        const reply = (status, data) => response(request, status, data);
        const action = url.pathname.slice(5);
        if (!["get", "set", "delete"].includes(action)) return reply(404, { error: "Unknown action" });
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
