import { BoxJS } from "../BoxJS.mjs";
import { validatePathParts } from "./settings-path.mjs";

/**
 * 将 BoxJS 数组、app 或订阅转换为模块字段，保留原文件为唯一字段来源。
 * Normalize a BoxJS array, app or subscription using the source JSON as the field authority.
 * @param {unknown | BoxJS} config BoxJS JSON 或已解析目录 / BoxJS document or parsed catalog.
 * @param {string} module API 第一段模块名 / First API path segment.
 * @returns {import("../index.js").ModuleDefinition} 存储根和字段 / Storage root and fields.
 * @throws {TypeError} 配置结构、字段路径、默认值或展示属性无效 / Invalid configuration, field path, default or presentation attribute.
 */
export function normalizeBoxJs(config, module) {
    validatePathParts([module]);
    const catalog = config instanceof BoxJS ? config : new BoxJS(config);
    const target = catalog.modules.get(module);
    if (!target) throw new TypeError(`No BoxJS settings for module: ${module}`);
    const { entries, storageKey } = target;
    const metadata = normalizeMetadata(target.metadata);
    const fields = [];
    for (const entry of entries) {
        const parts = entry.id.slice(1).split(".").slice(1);
        const type = { boolean: "boolean", checkboxes: "array", selects: "select", text: "string", textarea: "string", number: "number" }[entry.type];
        if (!type) throw new TypeError(`Unsupported BoxJS control: ${entry.type}`);
        const field = {
            key: parts.join("."),
            type: type === "select" ? typeof entry.val : type,

            name: entry.name,
            description: entry.desc ?? "",
            control: entry.type,
            ...(entry.placeholder === undefined ? {} : { placeholder: entry.placeholder }),
            ...(entry.rows === undefined ? {} : { rows: entry.rows }),
            ...(entry.autoGrow === undefined ? {} : { autoGrow: entry.autoGrow }),
        };
        if (type === "select" && !["string", "number", "boolean"].includes(field.type)) throw new TypeError(`Select requires a scalar val: ${entry.id}`);
        if (entry.items) field.options = entry.items.map(item => ({ key: item.key, label: item.label }));
        if (Object.hasOwn(entry, "val")) field.defaultValue = normalizeStoredValue(field, entry.val);
        if (
            typeof field.name !== "string" ||
            (field.placeholder !== undefined && typeof field.placeholder !== "string") ||
            (field.rows !== undefined && (!Number.isInteger(field.rows) || field.rows < 1)) ||
            (field.autoGrow !== undefined && typeof field.autoGrow !== "boolean") ||
            fields.some(other => other.key === field.key || other.key.startsWith(`${field.key}.`) || field.key.startsWith(`${other.key}.`))
        )
            throw new TypeError(`Invalid or overlapping BoxJS field: ${entry.id}`);
        if (field.options && (new Set(field.options.map(item => item.key)).size !== field.options.length || field.options.some(item => !scalar(item.key) || typeof item.label !== "string"))) throw new TypeError(`Invalid options: ${entry.id}`);
        if (Object.hasOwn(field, "defaultValue") && !validValue(field, field.defaultValue)) throw new TypeError(`Invalid BoxJS val: ${entry.id}`);
        fields.push(field);
    }
    if (!fields.length) throw new TypeError(`No BoxJS settings for module: ${module}`);
    const common = fields[0].key.split(".").slice(0, -1);
    for (const field of fields) while (!field.key.startsWith(`${common.join(".")}.`)) common.pop();
    return {
        module,
        storageKey,
        fields,
        settingsPath: common,
        ...(Object.keys(metadata).length ? { metadata } : {}),
    };
}

/**
 * 校验供浏览器展示的标准 BoxJS 元数据。
 * Validate standard BoxJS metadata used by the browser renderer.
 * @param {Record<string, unknown>} source 原始展示元数据 / Raw presentation metadata.
 * @returns {import("../index.js").BoxJSMetadata} 规范化展示元数据 / Normalized presentation metadata.
 */
function normalizeMetadata(source) {
    const result = {};
    for (const [key, value] of Object.entries(source)) {
        const multiple = key === "icons" || key === "descs";
        const values = multiple ? value : [value];
        if (!Array.isArray(values) || values.some(item => typeof item !== "string")) throw new TypeError(`Invalid BoxJS app ${key}`);
        result[key] = multiple ? [...values] : value;
    }
    return result;
}

/**
 * 归一化 BoxJS 的字符串存储值，不改变普通文本内容。
 * Normalize BoxJS string persistence without changing free-text values.
 * @param {import("../index.js").SettingsField} field 前端字段约束 / Frontend field constraints.
 * @param {unknown} value 存储值 / Stored value.
 * @returns {unknown} 转换后的控件值；是否允许写入由 validValue 单独校验 / Converted control value; write eligibility is checked separately by validValue.
 */
export function normalizeStoredValue(field, value) {
    switch (field.type) {
        case "boolean":
            if (value === "true" || value === "false") return value === "true";
            break;
        case "number":
            if (typeof value === "string" && value.trim() !== "") return Number(value);
            break;
        case "array":
            if (typeof value === "string") value = value === "" || value === "[]" ? [] : value.split(",");
            break;
        default:
            break;
    }
    if (field.options) {
        const match = item => field.options.find(option => String(option.key) === String(item))?.key ?? item;
        return field.type === "array" && Array.isArray(value) ? value.map(match) : match(value);
    }
    return value;
}

/**
 * 校验支持的标量范围，包括文本长度与数值有限性。
 * Validate supported scalar bounds, including text length and numeric finiteness.
 * @param {unknown} value 待检查值 / Value to inspect.
 * @returns {boolean} 是否为有效标量 / Whether the scalar is valid.
 */
function scalar(value) {
    switch (typeof value) {
        case "boolean":
            return true;
        case "string":
            return value.length <= 2048;
        case "number":
            return Number.isFinite(value);
        default:
            return false;
    }
}

/**
 * 检查值类型、数组唯一性及声明的选项，不进行转换。
 * Check value type, array uniqueness and declared choices without coercion.
 * @param {import("../index.js").SettingsField} field 前端归一化字段 / Normalized frontend field.
 * @param {unknown} value 待写入的 JSON 值 / JSON value to write.
 * @returns {boolean} 是否符合字段约束 / Whether the value satisfies field constraints.
 */
export function validValue(field, value) {
    if (field.type === "array") {
        if (!Array.isArray(value) || value.some(item => !scalar(item)) || new Set(value).size !== value.length) return false;
    } else if (typeof value !== field.type || !scalar(value)) return false;
    return !field.options || (field.type === "array" ? value : [value]).every(item => field.options.some(option => option.key === item));
}
