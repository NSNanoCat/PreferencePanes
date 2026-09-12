import { validatePathParts } from "./lib/settings-path.mjs";

/**
 * BoxJS 的共同目录：只索引模块、存储根和原始展示元数据。
 * Shared BoxJS catalog indexing modules, storage roots and raw presentation metadata only.
 */
export class BoxJS {
    /**
     * 建立路径索引，不解析控件类型，也不读写持久化存储。
     * Index field paths without interpreting controls or accessing persistence.
     * @param {unknown} input 字段数组、单个 app 或 apps 订阅 / Field array, app or apps subscription.
     */
    constructor(input) {
        if (!input || typeof input !== "object") throw new TypeError("Expected BoxJS JSON");
        const document = JSON.parse(JSON.stringify(input));
        const apps = Array.isArray(document) ? [{ settings: document }] : (document.apps ?? [document]);
        if (!Array.isArray(apps)) throw new TypeError("Expected BoxJS apps array");
        this.modules = new Map();
        for (const app of apps) {
            if (!app || !Array.isArray(app.settings)) throw new TypeError("Expected BoxJS settings array");
            for (const entry of app.settings) {
                if (typeof entry.id !== "string") throw new TypeError("BoxJS settings require string IDs");
                if (!entry.id.startsWith("@")) {
                    if (Array.isArray(document)) throw new TypeError("BoxJS settings require @root.path IDs");
                    continue;
                }
                const [storageKey, ...parts] = entry.id.slice(1).split(".");
                if (!storageKey || storageKey.startsWith("@") || parts.length < 2) throw new TypeError("A BoxJS setting must be below a literal storage root and module");
                validatePathParts(parts);
                const module = parts[0];
                let target = this.modules.get(module);
                if (!target) {
                    target = { module, storageKey, entries: [], owners: new Set() };
                    this.modules.set(module, target);
                }
                if (target.storageKey !== storageKey) throw new TypeError(`A module must use one storage root: ${module}`);
                target.entries.push(entry);
                target.owners.add(app);
            }
        }
        this.metadata = presentation(Array.isArray(document) ? {} : document);
        for (const target of this.modules.values()) target.metadata = target.owners.size === 1 ? presentation([...target.owners][0]) : {};
    }

    /**
     * 取得本次导入的唯一模块，避免把模块数据变成项目目录。
     * Get the single imported module without turning module data into a project directory.
     * @returns {object} 唯一模块的目录项 / The single module entry.
     */
    get module() {
        if (this.modules.size !== 1) throw new TypeError("Import BoxJS JSON for exactly one module");
        return this.modules.values().next().value;
    }
}

/**
 * 保留原始 BoxJS 展示信息，具体类型由浏览器规范化器校验。
 * Retain raw BoxJS presentation data; the browser normalizer validates concrete types.
 * @param {object} source BoxJS app 或订阅 / BoxJS app or subscription.
 * @returns {object} 原始展示信息 / Raw presentation metadata.
 */
function presentation(source) {
    const result = {};
    for (const key of ["id", "name", "author", "repo", "script", "icon", "description", "desc", "icons", "descs"]) {
        if (source[key] === undefined) continue;
        result[key] = source[key];
    }
    return result;
}
