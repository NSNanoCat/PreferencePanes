import type { ModuleDefinition, ModuleModel, SettingsScalar } from "../index.js";
/**
 * 单键写入或删除的通知事件。
 * Notification for a single-key write or delete.
 */
export interface Notification {
    /** 结果类别 / Result kind. */
    kind: "success" | "error";
    /** 操作类别 / Operation kind. */
    operation: "write" | "delete" | "clearCaches" | "reset";
    /** 模块标识 / Module identifier. */
    module: string;
    /** 字段路径 / Field path. */
    key?: string;
    /** 失败原因 / Failure reason. */
    message?: string;
}
/**
 * 浏览器页面客户端选项；模型由 API 提供。
 * Browser page client options; the model is supplied by the API.
 */
export interface PreferencesClientOptions {
    /** API 返回的模块模型 / Module model returned by the API. */
    model: ModuleModel;
    /** 用于渲染的归一化字段定义 / Normalized field definition for rendering. */
    definition: ModuleDefinition;
    /** 默认使用浏览器 fetch / Defaults to browser fetch. */
    fetch?: typeof globalThis.fetch;
    /** 操作通知 / Mutation notifications. */
    notify?: (notification: Notification) => void;
    /** 请求超时毫秒数 / Request timeout in milliseconds. */
    timeout?: number;
}
/**
 * 会话的深拷贝快照。
 * Deep-cloned session snapshot.
 */
export interface ModuleSnapshot {
    /** 当前模块字段定义 / Current module field definition. */
    definition: ModuleDefinition;
    /** 当前页面值 / Current page values. */
    values: Record<string, SettingsScalar | SettingsScalar[] | null>;
}
/**
 * 只调用模块 API 的页面客户端。
 * Page client that only calls the module API.
 */
export interface PreferencesClient {
    /** 获取页面快照，不发请求 / Get a page snapshot without a request. */
    snapshot(): ModuleSnapshot;
    /** 读取 Settings 子树 / Read the Settings subtree. */
    readSettings(): Promise<unknown>;
    /** 读取 Caches 子树 / Read the Caches subtree. */
    readCaches(): Promise<unknown>;
    /** 删除 Caches / Delete Caches. */
    clearCaches(): Promise<void>;
    /** 删除整个模块数据并恢复默认值 / Delete module data and restore defaults. */
    reset(): Promise<void>;
    /** 取消请求 / Cancel requests. */
    leave(): void;
    /** 写入单个字段 / Write one field. */
    set(key: string, value: SettingsScalar | SettingsScalar[]): Promise<void>;
    /** 删除单个字段覆盖值 / Delete one field override. */
    remove(key: string): Promise<void>;
}
/**
 * 创建只调用模块 API 的页面客户端。
 * Create a page client that only calls the module API.
 * @param options API 模型与运行环境 / API model and runtime.
 * @returns 页面客户端 / Page client.
 */
export function createPreferencesClient(options: PreferencesClientOptions): PreferencesClient;
