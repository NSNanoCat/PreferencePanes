import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";
import { parseSettingsPath } from "./settings-path.mjs";

/**
 * 创建按 database 键路径读写的接口，固定前缀仅为 /api/。
 * Create a database-path endpoint; /api/ is the only fixed prefix.
 * @param {import("../types/index.js").SettingsHandlerOptions} options 来源、存储根键及完整字段路径 / Origin, storage root and full field paths.
 * @returns {(request: import("../types/index.js").SettingsRequest) => import("../types/index.js").SettingsResponse | undefined} 同步处理器 / Synchronous handler.
 */
export function createSettingsHandler({ origin, fields, storageKey, requestHeader = "X-Settings-Client", resolveSettings }) {
  const target = new URL(origin);
  if (target.protocol !== "https:" || target.pathname !== "/" || target.search || target.hash || target.username || target.password)
    throw new TypeError("origin must be an HTTPS origin without a path");
  if (typeof storageKey !== "string" || !storageKey) throw new TypeError("storageKey is required");
  if (
    !/^[a-z][a-z0-9-]*$/i.test(requestHeader) ||
    ["origin", "cookie", "authorization", "content-type"].includes(requestHeader.toLowerCase())
  )
    throw new TypeError("requestHeader must be a dedicated header");
  if (!Array.isArray(fields) || !fields.length) throw new TypeError("fields must be a non-empty array");
  if (resolveSettings !== undefined && typeof resolveSettings !== "function") throw new TypeError("resolveSettings must be a function");
  const schema = JSON.parse(JSON.stringify(fields));
  const fieldByKey = new Map();
  for (const field of schema) {
    if (typeof field.key !== "string") throw new TypeError("field key must be a dot-separated path");
    parseSettingsPath(`${target.origin}/api/${field.key.split(".").map(encodeURIComponent).join("/")}`);
    if (!["boolean", "number", "string", "array"].includes(field.type)) throw new TypeError(`Unsupported field type: ${field.key}`);
    if (
      fieldByKey.has(field.key) ||
      [...fieldByKey.keys()].some((key) => key.startsWith(`${field.key}.`) || field.key.startsWith(`${key}.`))
    )
      throw new TypeError(`Overlapping field key: ${field.key}`);
    if (
      field.options &&
      (!Array.isArray(field.options) ||
        field.options.some((option) => !isScalar(option.key)) ||
        new Set(field.options.map((option) => option.key)).size !== field.options.length)
    )
      throw new TypeError(`Invalid options: ${field.key}`);
    if (Object.hasOwn(field, "defaultValue") && !validValue(field, field.defaultValue))
      throw new TypeError(`Invalid defaultValue: ${field.key}`);
    fieldByKey.set(field.key, field);
  }
  const clientHeader = requestHeader.toLowerCase();
  return function settingsHandler(request) {
    const url = new URL(request.url);
    if (url.origin !== target.origin || !url.pathname.startsWith("/api/")) return;
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const reply = (status, data) => ({ status, headers, body: request.method === "HEAD" || status === 204 ? "" : JSON.stringify(data) });
    const requestHeaders = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    if (requestHeaders[clientHeader] !== "1" || (requestHeaders.origin && requestHeaders.origin !== target.origin))
      return reply(403, { error: "Forbidden settings client" });
    let parts;
    try {
      parts = parseSettingsPath(request.url);
    } catch (error) {
      return reply(400, { error: error.message });
    }
    const key = parts.join(".");
    const field = fieldByKey.get(key);
    if (!field) return reply(404, { error: `Unknown setting: ${key}` });
    if (request.method === "HEAD") return reply(200, undefined);
    if (!["GET", "POST", "DELETE"].includes(request.method))
      return { ...reply(405, { error: "Method not allowed" }), headers: { ...headers, Allow: "HEAD, GET, POST, DELETE" } };
    if (request.method === "GET") {
      const stored = Storage.getItem(storageKey, {});
      const effective = resolveSettings ? resolveSettings(stored) : stored;
      if (!isRecord(effective)) throw new TypeError("resolved settings must be a synchronous object");
      const parent = settingsParent(effective, parts, false);
      const value = parent ? _.get(parent, [parts.at(-1)], field.defaultValue) : field.defaultValue;
      return value === undefined ? reply(404, { error: `Setting has no value: ${key}` }) : reply(200, value);
    }
    let value;
    if (request.method === "POST") {
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
    }
    const saved = Storage.getItem(storageKey, {});
    if (!isRecord(saved)) throw new TypeError("stored settings must be an object");
    const parent = settingsParent(saved, parts, request.method === "POST");
    if (parent) {
      if (request.method === "DELETE") _.unset(parent, [parts.at(-1)]);
      else _.set(parent, [parts.at(-1)], value);
    }
    if (!Storage.setItem(storageKey, saved)) return reply(500, { error: "Settings storage write failed" });
    return reply(204, undefined);
  };
}

// util 的 @root.path 写入可能将中间配置保存为 JSON 字符串；通用遍历保留这些已有字段。
// util @root.path writes can serialize intermediate objects; decode them while preserving their fields.
function settingsParent(root, parts, create) {
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    let next = _.get(parent, [part]);
    if (next === undefined) {
      if (!create) return;
      next = {};
    } else if (typeof next === "string") next = JSON.parse(next);
    if (!isRecord(next)) throw new TypeError(`Stored path is not an object: ${part}`);
    _.set(parent, [part], next);
    parent = next;
  }
  return parent;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}
function isScalar(value) {
  return (
    typeof value === "boolean" ||
    (typeof value === "string" && value.length <= 2048) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
function validValue(field, value) {
  if (field.type === "array") {
    if (!Array.isArray(value) || value.some((item) => !isScalar(item)) || new Set(value).size !== value.length) return false;
  } else if (typeof value !== field.type || !isScalar(value)) return false;
  return !field.options || (field.type === "array" ? value : [value]).every((item) => field.options.some((option) => option.key === item));
}
