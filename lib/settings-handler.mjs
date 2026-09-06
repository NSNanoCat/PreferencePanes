import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";

/**
 * 按字段定义创建通用设置接口，不改变配置优先级或调用 $done。
 * Create a schema-driven endpoint without changing precedence or calling $done.
 * @param {import("../types/index.js").SettingsHandlerOptions} options 路由、存储和字段 / Route, storage and fields.
 * @returns {(request: import("../types/index.js").SettingsRequest) => import("../types/index.js").SettingsResponse | undefined} 同步处理器 / Synchronous handler.
 */
export function createSettingsHandler({ module, fields, storageKey, endpoint, requestHeader = "X-Settings-Client", resolveSettings }) {
  const target = new URL(endpoint);
  if (target.protocol !== "https:" || target.search || target.hash || target.username || target.password)
    throw new TypeError("endpoint must be HTTPS without query, fragment or credentials");
  if (typeof module !== "string" || !module || typeof storageKey !== "string" || !storageKey)
    throw new TypeError("module and storageKey are required");
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
    if (
      typeof field.key !== "string" ||
      !field.key.split(".").every((part) => /^[a-zA-Z0-9_-]+$/.test(part) && !["__proto__", "prototype", "constructor"].includes(part))
    )
      throw new TypeError("fields require safe dot-separated keys");
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
    if (url.origin !== target.origin || url.pathname !== target.pathname) return;
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const reply = (status, data) => ({ status, headers, body: request.method === "HEAD" ? "" : JSON.stringify(data) });
    const requestHeaders = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    if (requestHeaders[clientHeader] !== "1" || (requestHeaders.origin && requestHeaders.origin !== target.origin))
      return reply(403, { error: "Forbidden settings client" });
    if (request.method === "HEAD") return reply(200, {});
    if (!["GET", "POST", "DELETE"].includes(request.method))
      return { ...reply(405, { error: "Method not allowed" }), headers: { ...headers, Allow: "HEAD, GET, POST, DELETE" } };
    if (request.method === "GET") {
      const stored = Storage.getItem(storageKey, {});
      const effective = resolveSettings ? resolveSettings(stored) : stored;
      if (!isRecord(effective)) throw new TypeError("resolved settings must be a synchronous object");
      const values = Object.fromEntries(schema.map((field) => [field.key, _.get(effective, field.key, field.defaultValue)]));
      return reply(200, { module, fields: schema, values });
    }
    if (requestHeaders["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json")
      return reply(415, { error: "Expected application/json" });
    if (typeof request.body !== "string") return reply(400, { error: "Expected a JSON string body" });
    if (request.body.length > 65536) return reply(413, { error: "Body exceeds 65536 UTF-16 code units" });
    let input;
    try {
      input = JSON.parse(request.body);
    } catch {
      return reply(400, { error: "Invalid JSON" });
    }
    if (request.method === "DELETE") {
      if (typeof input?.key !== "string" || !fieldByKey.has(input.key)) return reply(400, { error: "Expected a declared setting key" });
      const saved = Storage.getItem(storageKey, {});
      if (!isRecord(saved)) throw new TypeError("stored settings must be an object");
      if (_.get(saved, input.key) !== undefined) _.unset(saved, input.key);
      if (!Storage.setItem(storageKey, saved)) return reply(500, { error: "Settings storage write failed" });
      return reply(200, { deleted: true });
    }
    if (!isRecord(input?.values) || !Object.keys(input.values).length) return reply(400, { error: "Expected non-empty values object" });
    const entries = Object.entries(input.values);
    for (const [key, value] of entries) {
      const field = fieldByKey.get(key);
      if (!field) return reply(400, { error: `Unknown setting: ${key}` });
      if (!validValue(field, value)) return reply(400, { error: `Invalid setting value: ${key}` });
    }
    // 完整校验补丁后才写入，保留未展示字段和同级配置。
    // Validate the whole patch first; retain hidden settings and sibling profiles.
    const saved = Storage.getItem(storageKey, {});
    if (!isRecord(saved)) throw new TypeError("stored settings must be an object");
    for (const [key, value] of entries) _.set(saved, key, value);
    if (!Storage.setItem(storageKey, saved)) return reply(500, { error: "Settings storage write failed" });
    return reply(200, { saved: true });
  };
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
