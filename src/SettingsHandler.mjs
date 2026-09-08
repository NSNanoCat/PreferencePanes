import { URL } from "@nsnanocat/url";
import { fetch } from "@nsnanocat/util/polyfill/fetch";
import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";
import { normalizeBoxJs, validValue } from "./lib/boxjs.mjs";
import { parseSettingsPathname } from "./lib/settings-path.mjs";

/**
 * 使用 util 下载 BoxJS、校验字段并读写持久化存储。
 * Download BoxJS through util, validate fields and handle persistent storage.
 */
export class SettingsHandler {
  #origin;
  #configURL;
  #requestHeader;
  #resolveSettings;

  /** @param {import("./index.js").SettingsHandlerOptions} options 来源、配置地址与 GET 解析器 / Origin, config source and GET resolver. */
  constructor({ origin, configURL, requestHeader = "X-Settings-Client", resolveSettings }) {
    const target = new URL(origin);
    if (target.protocol !== "https:" || target.pathname !== "/" || target.search || target.hash || target.username || target.password)
      throw new TypeError("origin must be an HTTPS origin");
    const source = new URL(configURL);
    if (source.protocol !== "https:" || source.username || source.password || source.hash)
      throw new TypeError("configURL must be an HTTPS URL without credentials or fragment");
    if (!/^[a-z][a-z0-9-]*$/i.test(requestHeader)) throw new TypeError("Invalid requestHeader");
    this.#origin = target.origin;
    this.#configURL = source.href;
    this.#requestHeader = requestHeader;
    this.#resolveSettings = resolveSettings;
  }

  /**
   * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
   * @returns {Promise<import("./index.js").SettingsResponse | undefined>} API 响应，非本来源 API 则不处理 / API response, or undefined outside the configured API origin.
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
    const requestHeaders = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    if (requestHeaders[this.#requestHeader.toLowerCase()] !== "1" || (requestHeaders.origin && requestHeaders.origin !== this.#origin))
      return reply(403, { error: "Forbidden settings client" });
    if (!["HEAD", "GET", "POST", "DELETE"].includes(request.method))
      return { ...reply(405, { error: "Method not allowed" }), headers: { ...headers, Allow: "HEAD, GET, POST, DELETE" } };
    let definition;
    try {
      const response = await fetch({ url: this.#configURL, method: "GET", headers: { "Cache-Control": "no-cache" }, timeout: 5000 });
      if (response.status !== 200) throw new Error(`BoxJS source HTTP ${response.status}`);
      definition = normalizeBoxJs(JSON.parse(response.body), parts[0]);
    } catch (error) {
      return reply(502, { error: `Module configuration unavailable: ${error.message}` });
    }
    const key = parts.join(".");
    const field = definition.fields.find((field) => field.key === key);
    const descendants = definition.fields.filter((field) => field.key.startsWith(`${key}.`));
    if (!field && !descendants.length) return reply(404, { error: `Unknown setting path: ${key}` });
    let value;
    switch (request.method) {
      case "HEAD":
        return reply(200, undefined);

      case "GET": {
        const stored = Storage.getItem(definition.storageKey, {});
        const effective = this.#resolveSettings ? this.#resolveSettings(stored, definition) : stored;
        if (!isRecord(effective)) throw new TypeError("resolved settings must be a synchronous object");
        if (field) {
          const value = pathValue(effective, parts);
          return value === undefined ? reply(404, { error: `Setting has no stored value: ${key}` }) : reply(200, value);
        }
        const subtree = {};
        // 只返回配置文件公开的字段；默认值由浏览器用 BoxJS val 生成。
        // Expose only declared fields; the browser renders defaults from BoxJS val.
        for (const descendant of descendants) {
          const fullPath = descendant.key.split(".");
          const value = pathValue(effective, fullPath);
          if (value !== undefined) _.set(subtree, fullPath.slice(parts.length), value);
        }
        return reply(200, subtree);
      }

      case "POST":
        if (!field) return reply(405, { error: "Only individual declared keys can be modified" });
        if (requestHeaders["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json")
          return reply(415, { error: "Expected application/json" });
        if (typeof request.body !== "string") return reply(400, { error: "Expected a JSON string body" });
        if (request.body.length > 65536) return reply(413, { error: "Body exceeds 65536 UTF-16 code units" });
        try {
          value = JSON.parse(request.body);
        } catch {
          return reply(400, { error: "Invalid JSON" });
        }
        if (!validValue(field, value)) return reply(400, { error: `Invalid setting value: ${key}` });
        break;

      case "DELETE":
        if (!field) return reply(405, { error: "Only individual declared keys can be modified" });
        break;
    }

    // POST 和 DELETE 共用一次读改写；HEAD/GET 已在各自分支返回。
    // POST and DELETE share one read-modify-write; HEAD/GET return above.
    const saved = Storage.getItem(definition.storageKey, {});
    if (!isRecord(saved)) throw new TypeError("stored settings must be an object");
    const parent = settingsParent(saved, parts, request.method === "POST");
    if (parent) {
      if (request.method === "DELETE") _.unset(parent, [parts.at(-1)]);
      else _.set(parent, [parts.at(-1)], value);
    }
    if (!Storage.setItem(definition.storageKey, saved)) return reply(500, { error: "Settings storage write failed" });
    return reply(200, request.method === "DELETE" ? { deleted: true } : { saved: true });
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function pathValue(root, parts) {
  const parent = settingsParent(root, parts, false);
  return parent ? _.get(parent, [parts.at(-1)]) : undefined;
}

// util 的 @root.path 允许序列化中间对象；统一解码并保留相邻键。
// Decode util-serialized intermediate objects while retaining sibling keys.
function settingsParent(root, parts, create) {
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
    if (!isRecord(next)) throw new TypeError(`Stored path is not an object: ${part}`);
    _.set(parent, [part], next);
    parent = next;
  }
  return parent;
}
