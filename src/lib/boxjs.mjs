import { parseSettingsPath } from "./settings-path.mjs";

/**
 * 将 BoxJS 数组、app 或订阅转换为模块字段，保留原文件为唯一字段来源。
 * Normalize a BoxJS array, app or subscription using the source JSON as the field authority.
 * @param {unknown} config BoxJS JSON / BoxJS document.
 * @param {string} module API 第一段模块名 / First API path segment.
 * @returns {import("../index.js").ModuleDefinition} 存储根和字段 / Storage root and fields.
 */
export function normalizeBoxJs(config, module) {
  parseSettingsPath(`https://example.invalid/api/${module}`);
  const entries = Array.isArray(config) ? config : config?.apps ? config.apps.flatMap((app) => app.settings ?? []) : config?.settings;
  if (!Array.isArray(entries)) throw new TypeError("Expected BoxJS settings array, app or subscription");
  let storageKey;
  const fields = [];
  for (const entry of entries) {
    if (typeof entry.id !== "string" || !entry.id.startsWith("@")) throw new TypeError("BoxJS settings require @root.path IDs");
    const [root, ...parts] = entry.id.slice(1).split(".");
    if (parts[0] !== module) continue;
    if (parts.length < 2) throw new TypeError("A BoxJS setting must be below the module root");
    parseSettingsPath(`https://example.invalid/api/${parts.map(encodeURIComponent).join("/")}`);
    if (!root || (storageKey && root !== storageKey)) throw new TypeError("A module must use one storage root");
    storageKey = root;
    const type = { boolean: "boolean", checkboxes: "array", selects: "select", text: "string", textarea: "string", number: "number" }[
      entry.type
    ];
    if (!type) throw new TypeError(`Unsupported BoxJS control: ${entry.type}`);
    const field = {
      key: parts.join("."),
      name: entry.name,
      type: type === "select" ? typeof entry.val : type,
      description: entry.desc ?? "",
    };
    if (type === "select" && !["string", "number", "boolean"].includes(field.type))
      throw new TypeError(`Select requires a scalar val: ${entry.id}`);
    if (entry.items) field.options = entry.items.map((item) => ({ key: item.key, label: item.label }));
    if (Object.hasOwn(entry, "val")) field.defaultValue = normalizeStoredValue(field, entry.val);
    if (
      typeof field.name !== "string" ||
      fields.some((other) => other.key === field.key || other.key.startsWith(`${field.key}.`) || field.key.startsWith(`${other.key}.`))
    )
      throw new TypeError(`Invalid or overlapping BoxJS field: ${entry.id}`);
    if (
      field.options &&
      (new Set(field.options.map((item) => item.key)).size !== field.options.length ||
        field.options.some((item) => !scalar(item.key) || typeof item.label !== "string"))
    )
      throw new TypeError(`Invalid options: ${entry.id}`);
    if (Object.hasOwn(field, "defaultValue") && !validValue(field, field.defaultValue))
      throw new TypeError(`Invalid BoxJS val: ${entry.id}`);
    fields.push(field);
  }
  if (!fields.length) throw new TypeError(`No BoxJS settings for module: ${module}`);
  const common = fields[0].key.split(".").slice(0, -1);
  for (const field of fields) while (!field.key.startsWith(`${common.join(".")}.`)) common.pop();
  return { module, storageKey, fields, settingsPath: common };
}

/**
 * 归一化 BoxJS 的字符串存储值，不改变普通文本内容。
 * Normalize BoxJS string persistence without changing free-text values.
 * @param {import("../index.js").SettingsField} field 字段 / Field.
 * @param {unknown} value 存储值 / Stored value.
 * @returns {unknown} 控件值 / Control value.
 */
export function normalizeStoredValue(field, value) {
  if (field.type === "boolean" && (value === "true" || value === "false")) return value === "true";
  if (field.type === "number" && typeof value === "string" && value.trim() !== "") return Number(value);
  if (field.type === "array" && typeof value === "string") value = value === "" || value === "[]" ? [] : value.split(",");
  if (field.options) {
    const match = (item) => field.options.find((option) => String(option.key) === String(item))?.key ?? item;
    return field.type === "array" && Array.isArray(value) ? value.map(match) : match(value);
  }
  return value;
}

function scalar(value) {
  return (
    typeof value === "boolean" ||
    (typeof value === "string" && value.length <= 2048) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

export function validValue(field, value) {
  if (field.type === "array") {
    if (!Array.isArray(value) || value.some((item) => !scalar(item)) || new Set(value).size !== value.length) return false;
  } else if (typeof value !== field.type || !scalar(value)) return false;
  return !field.options || (field.type === "array" ? value : [value]).every((item) => field.options.some((option) => option.key === item));
}
