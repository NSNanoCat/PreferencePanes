import type { ModuleDefinition, ModuleModel, SettingsScalar } from "../index.js";
/**
 * 单键写入或删除的通知事件，携带对应模块与点分键路径。
 * Notification for a single-key write or delete, including module and dotted key path.
 */
export interface Notification {
    /**
     * 结果类别
     * Result kind.
     */
    kind: "success" | "error";
    /**
     * 操作类别
     * Operation kind.
     */
    operation: "write" | "delete" | "clearCaches" | "reset";
    /**
     * 模块标识
     * Module identifier.
     */
    module: string;
    /**
     * 含模块名、不含存储根的点分路径
     * Dotted path including the module but excluding the storage root.
     */
    key: string;
    /**
     * 失败原因，仅错误事件提供
     * Failure reason, provided for errors only.
     */
    message?: string;
}
/**
 * 浏览器会话客户端选项。
 * Options for the browser session client.
 */
export interface PreferencesClientOptions {
    /**
     * 模块 API 基路径，后接 /{module}/{action}。
     * Module API base path followed by /{module}/{action}.
     */
    apiBase?: string;
    /**
     * 返回 BoxJS JSON 的资源地址；请求头随 API 请求发送。
     * BoxJS JSON resource URL sent with module API requests.
     */
    configURL?: string | ((module: string) => string);
    /**
     * 默认使用浏览器 fetch，可注入同签名传输
     * Defaults to browser fetch; an equivalent transport may be supplied.
     */
    fetch?: typeof globalThis.fetch;
    /**
     * 成功写入或失败时调用，不用于读取事件
     * Called for successful mutations or failures, not reads.
     */
    notify?: (notification: Notification) => void;
    /**
     * 单次请求超时，单位毫秒，默认 10000
     * Per-request timeout in milliseconds; defaults to 10000.
     */
    timeout?: number;
}
/**
 * 会话的深拷贝快照，调用方修改不会影响缓存。
 * Deep-cloned session snapshot; caller changes cannot alter the cache.
 */
export interface ModuleSnapshot {
    /**
     * 当前配置生成的模块定义
     * Module definition generated from current config.
     */
    definition: ModuleDefinition;
    /**
     * 点分键到显示值的映射，已包含适用的默认值；持久化 null 原样保留。
     * Dotted keys mapped to display values including applicable defaults; persisted null is preserved.
     */
    values: Record<string, SettingsScalar | SettingsScalar[] | null>;
}
/**
 * 只在页面存活期间维护模块缓存的通用客户端。
 * Generic client maintaining module caches only during the page lifetime.
 */
export interface PreferencesClient {
    /**
     * 使用已导入的 JSON 替换会话，只读取一次设置值。
     * Replace the session from imported JSON and read stored settings once.
     * @param module 模块标识 / Module identifier.
     * @returns 新会话的独立快照 / Independent snapshot of the new session.
     * @throws {Error} 写入进行中、请求或配置无效、会话被替换 / Active write, invalid request or config, or replaced session.
     */
    open(module: string, initialModel?: ModuleModel): Promise<ModuleSnapshot>;
    /**
     * 获取已打开模块的快照，不发请求。
     * Get a snapshot of an open module without network requests.
     * @param module 模块标识 / Module identifier.
     * @returns 深拷贝快照 / Deep-cloned snapshot.
     * @throws {Error} 模块尚未打开 / Module has not been opened.
     */
    snapshot(module: string): ModuleSnapshot;
    /**
     * 取消未完成的读取并移除缓存，不撤销已发送的写入。
     * Abort pending reads and discard the cache without undoing dispatched writes.
     * @param module 模块标识 / Module identifier.
     * @returns 无返回值 / No return value.
     */
    leave(module: string): void;
    /**
     * POST 单个字段，HTTP 200 后更新缓存，不追加 GET。
     * POST one field and update its cache only on HTTP 200, without a follow-up GET.
     * @param module 已打开的模块 / Open module.
     * @param key 完整点分字段路径 / Complete dotted field path.
     * @param value 符合字段类型和选项的值 / Value matching the field type and choices.
     * @returns 操作完成 / Completion of the operation.
     * @throws {Error} 会话、值、并发写入或网络错误 / Session, value, concurrent-write or network error.
     */
    set(module: string, key: string, value: SettingsScalar | SettingsScalar[]): Promise<void>;
    /**
     * 通过模块 API 删除覆盖值，200 后显示默认值，不追加读取。
     * Delete an override through the module API and display its default after 200, without rereading.
     * @param module 已打开的模块 / Open module.
     * @param key 完整点分字段路径 / Complete dotted field path.
     * @returns 操作完成 / Completion of the operation.
     * @throws {Error} 会话、路径、并发写入或网络错误 / Session, path, concurrent-write or network error.
     */
    remove(module: string, key: string): Promise<void>;
    /**
     * 按需重新读取整个模块 Settings，不更新页面会话缓存。
     * Reread all module Settings on demand without updating the page-session cache.
     * @param module 已打开模块 / Open module.
     * @returns 设置 JSON 值，缺失时为 undefined / Settings JSON value, or undefined when absent.
     */
    readSettings(module: string): Promise<unknown>;
    /**
     * 按需读取整个模块 Caches，不刷新设置。
     * Read all module Caches on demand without refreshing settings.
     * @param module 已打开模块 / Open module.
     * @returns 缓存 JSON 值，缺失时为 undefined / Cache JSON value, or undefined when absent.
     */
    readCaches(module: string): Promise<unknown>;
    /**
     * 删除模块 Caches 并更新相关页面状态，不追加 GET。
     * Delete module Caches and update related page state without a follow-up GET.
     * @param module 已打开模块 / Open module.
     * @returns 清理完成 / Cleanup completion.
     */
    clearCaches(module: string): Promise<void>;
    /**
     * 删除整个模块持久化数据，页面使用当前 BoxJS 默认值。
     * Delete all module persistence and use current BoxJS defaults on the page.
     * @param module 已打开模块 / Open module.
     * @returns 重置完成 / Reset completion.
     */
    reset(module: string): Promise<void>;
}
/**
 * 创建包内客户端，接管请求和会话。
 * Create an internal client for requests and sessions.
 * @param options API 地址与运行环境 / API URL and runtime environment.
 * @returns 会话客户端 / Session client.
 */
export function createPreferencesClient(options: PreferencesClientOptions): PreferencesClient;
