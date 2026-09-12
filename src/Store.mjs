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
     * 读取完整 @root.path，缺失时返回 undefined。
     * Read a complete @root.path and return undefined when it does not exist.
     * @param {string} keyName 完整存储路径 / Complete storage path.
     * @returns {unknown} 存储值或 undefined / Stored value or undefined.
     */
    read(keyName) {
        const parts = parseKey(keyName);
        const root = Storage.getItem(parts.shift());
        if (!isRecord(root)) return undefined;
        return _.get(root, parts);
    }

    /**
     * 写入完整 @root.path，并在成功后返回 true。
     * Write a complete @root.path and return true after persistence succeeds.
     * @param {string} keyName 完整存储路径 / Complete storage path.
     * @param {unknown} value 可序列化值 / Serializable value.
     * @returns {boolean} 是否写入成功 / Whether persistence succeeded.
     */
    write(keyName, value) {
        const parts = parseKey(keyName);
        const storageKey = parts.shift();
        const root = this.#root(storageKey);
        const parent = storageParent(root, parts, true);
        _.set(parent, [parts.at(-1)], value);
        return Storage.setItem(storageKey, root);
    }

    /**
     * 删除完整 @root.path；路径缺失也视为操作完成。
     * Delete a complete @root.path; a missing path is still a completed operation.
     * @param {string} keyName 完整存储路径 / Complete storage path.
     * @returns {boolean} 是否写回成功 / Whether persistence succeeded.
     */
    remove(keyName) {
        const parts = parseKey(keyName);
        const storageKey = parts.shift();
        const root = this.#root(storageKey);
        const parent = storageParent(root, parts, false);
        if (parent) _.unset(parent, [parts.at(-1)]);
        return Storage.setItem(storageKey, root);
    }

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
        const headers = lowerHeaders(request.headers);
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
            parts = parseKey(key);
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
        const key = `@${parts.join(".")}`;
        try {
            switch (action) {
                case "get": {
                    const result = this.read(key);
                    return result === undefined ? reply(404, { error: "Stored path does not exist" }) : reply(200, result);
                }
                case "set":
                    if (!this.write(key, value)) throw new Error("Storage write failed");
                    return reply(200, { saved: true });
                case "delete":
                    if (!this.remove(key)) throw new Error("Storage write failed");
                    return reply(200, { deleted: true });
            }
        } catch (error) {
            return reply(500, { error: error.message });
        }
    }

    #root(storageKey) {
        const root = Storage.getItem(storageKey, {});
        if (!isRecord(root)) throw new TypeError("Stored root must be an object");
        return root;
    }
}

/**
 * 解析并校验完整存储路径。
 * Parse and validate a complete storage path.
 * @param {string} keyName 完整 @root.path / Complete @root.path.
 * @returns {string[]} 不含 @ 的路径片段 / Path segments without @.
 */
function parseKey(keyName) {
    if (typeof keyName !== "string" || !keyName.startsWith("@")) throw new TypeError("Storage keys must start with @");
    const parts = validatePathParts(keyName.slice(1).split("."));
    if (parts.length < 2) throw new TypeError("Specify a storage root and child path");
    return parts;
}

/**
 * 统一小写请求头名称。
 * Normalize request header names to lowercase.
 * @param {Record<string, string | undefined>} [headers] 请求头 / Request headers.
 * @returns {Record<string, string | undefined>} 小写请求头 / Lowercase headers.
 */
function lowerHeaders(headers = {}) {
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
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
 * @param {Record<string, unknown>} root 存储根 / Stored root.
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
