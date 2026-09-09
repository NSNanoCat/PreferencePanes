import { validatePathParts } from "./lib/settings-path.mjs";

/**
 * BoxJS 的共同目录：模块、存储根和展示元数据都来自同一份 JSON。
 * Shared BoxJS catalog deriving modules, storage roots and metadata from one JSON document.
 */
export class BoxJS {
    /**
     * 建立路径索引，不解析控件类型，也不读写持久化存储。
     * Index field paths without interpreting controls or accessing persistence.
     * @param {unknown} input 字段数组、单个 app 或 apps 订阅 / Field array, app or apps subscription.
     */
    constructor(input) {
        if (!input || typeof input !== "object") throw new TypeError("Expected BoxJS JSON");
        this.document = JSON.parse(JSON.stringify(input));
        const apps = Array.isArray(this.document) ? [{ settings: this.document }] : (this.document.apps ?? [this.document]);
        if (!Array.isArray(apps)) throw new TypeError("Expected BoxJS apps array");
        this.modules = new Map();
        for (const app of apps) {
            if (!app || !Array.isArray(app.settings)) throw new TypeError("Expected BoxJS settings array");
            for (const entry of app.settings) {
                if (typeof entry.id !== "string") throw new TypeError("BoxJS settings require string IDs");
                if (!entry.id.startsWith("@")) {
                    if (Array.isArray(this.document)) throw new TypeError("BoxJS settings require @root.path IDs");
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
        this.metadata = metadata(Array.isArray(this.document) ? {} : this.document);
        for (const target of this.modules.values()) target.metadata = target.owners.size === 1 ? metadata([...target.owners][0]) : {};
    }

    /**
     * 提取一个模块的原生 BoxJS，保留所属 app 的元数据。
     * Select a module's native BoxJS while retaining owning-app metadata.
     * @param {string} module 模块标识 / Module identifier.
     * @returns {unknown} 可直接用作配置 Mock 的 JSON / JSON suitable for a configuration Mock.
     */
    select(module) {
        const target = this.modules.get(module);
        if (!target) throw new TypeError(`No BoxJS settings for module: ${module}`);
        if (Array.isArray(this.document)) return target.entries;
        const apps = [...target.owners].map(app => ({ ...app, settings: app.settings.filter(entry => target.entries.includes(entry)) }));
        return this.document.apps ? { ...this.document, apps } : apps[0];
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
 * 保留标准 BoxJS 展示信息；script 仅为元数据，不执行。
 * Retain standard BoxJS presentation data; script is metadata only and never executed.
 * @param {object} source BoxJS app 或订阅 / BoxJS app or subscription.
 * @returns {object} 经过类型检查的展示信息 / Type-checked presentation metadata.
 */
function metadata(source) {
    const result = {};
    for (const key of ["id", "name", "author", "repo", "script", "icon", "description", "desc", "icons", "descs"]) {
        if (source[key] === undefined) continue;
        const multiple = key === "icons" || key === "descs";
        const values = multiple ? source[key] : [source[key]];
        if (!Array.isArray(values) || values.some(item => typeof item !== "string")) throw new TypeError(`Invalid BoxJS app ${key}`);
        result[key] = multiple ? [...values] : source[key];
    }
    return result;
}
