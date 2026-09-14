import type { ModuleDefinition, SettingsScalar } from "../index.js";
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
 * 浏览器页面客户端选项；字段定义来自 BoxJS。
 * Browser page client options; the field definition comes from BoxJS.
 */
export interface PreferencesClientOptions {
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
 * 外部存储值与当前字段定义不完全兼容时的非阻断诊断。
 * Non-blocking diagnostic for external storage that no longer fully matches a field definition.
 */
export interface StoredValueWarning {
    /** 警告类别 / Warning kind. */
    kind: "invalid-value" | "undefined-options";
    /** 触发警告的原始值或未定义选项 / Raw value or undefined options that triggered the warning. */
    values: unknown[];
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
    /** 按字段路径索引的非阻断存储警告 / Non-blocking storage warnings keyed by field path. */
    warnings: Record<string, StoredValueWarning>;
}
/**
 * 管理单模块页面的 API 请求、值快照和会话终止。
 * Manage API requests, value snapshots, and session termination for one module page.
 */
export class PreferencesClient {
    /** 创建页面客户端 / Create the page client. */
    constructor(options: PreferencesClientOptions);
    /** 读取设置并建立页面快照 / Read settings and establish the page snapshot. */
    open(): Promise<ModuleSnapshot>;
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
