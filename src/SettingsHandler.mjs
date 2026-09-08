import { URL } from "@nsnanocat/url";
import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";
import { parseSettingsPathname, validatePathParts } from "./lib/settings-path.mjs";

/**
 * 按插件声明的根和模块桥接持久化存储，不下载或解析 BoxJS。
 * Bridge persistence within the installed root and module without downloading or parsing BoxJS.
 */
export class SettingsHandler {
	/** @type {string} 接管来源 / Handled origin. */
	#origin;
	/** @type {string} 安装配置中的存储根 / Storage root from installation config. */
	#storageKey;
	/** @type {string} 安装配置中的模块 / Module from installation config. */
	#module;
	/** @type {string} 页面标记头 / Page marker header. */
	#requestHeader;

	/**
	 * 固定来源、存储根和模块，构造时不访问网络或存储。
	 * Fix the origin, storage root and module without network or storage access at construction.
	 * @param {import("./index.js").SettingsHandlerOptions} options 插件安装配置 / Plugin installation config.
	 * @throws {TypeError} 安装配置无效 / Invalid installation config.
	 */
	constructor({ origin, storageKey, module, requestHeader = "X-Settings-Client" }) {
		const target = new URL(origin);
		if (target.protocol !== "https:" || target.pathname !== "/" || target.search || target.hash || target.username || target.password) throw new TypeError("origin must be an HTTPS origin");
		if (typeof storageKey !== "string" || !storageKey || storageKey.startsWith("@")) throw new TypeError("storageKey must be a literal root key");
		validatePathParts([module]);
		if (!/^[a-z][a-z0-9-]*$/i.test(requestHeader)) throw new TypeError("Invalid requestHeader");
		this.#origin = target.origin;
		this.#storageKey = storageKey;
		this.#module = module;
		this.#requestHeader = requestHeader;
	}

	/**
	 * GET 返回指定值，POST 替换指定值，DELETE 删除指定键或整个模块。
	 * GET returns a value, POST replaces it, and DELETE removes a key or the entire module.
	 * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
	 * @returns {Promise<import("./index.js").SettingsResponse | undefined>} 响应或非接管请求 / Response, or undefined for an unhandled request.
	 */
	async handle(request) {
		const url = new URL(request.url);
		if (url.origin !== this.#origin || !url.pathname.startsWith("/api/")) return;
		const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
		const reply = (status, data) => ({ status, headers, body: request.method === "HEAD" ? "" : JSON.stringify(data) });
		let parts;
		try {
			parts = parseSettingsPathname(url.pathname);
		} catch (error) {
			return reply(400, { error: error.message });
		}
		if (parts[0] !== this.#module) return reply(404, { error: "Module is not handled" });
		const requestHeaders = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
		if (requestHeaders[this.#requestHeader.toLowerCase()] !== "1" || (requestHeaders.origin && requestHeaders.origin !== this.#origin)) return reply(403, { error: "Forbidden settings client" });
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
				return { ...reply(405, { error: "Method not allowed" }), headers: { ...headers, Allow: "HEAD, GET, POST, DELETE" } };
		}
		try {
			const root = Storage.getItem(this.#storageKey, {});
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
			if (!Storage.setItem(this.#storageKey, root)) throw new Error("Storage write failed");
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
