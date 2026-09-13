import type { BoxJSInput } from "../index.js";

/**
 * 具体模块设置页的生命周期句柄。
 * Lifecycle handle for a concrete module settings page.
 */
export interface MountedPreferences {
    /** 移除页面、样式和监听器 / Remove page, styles and listeners. */
    destroy(): void;
}
/**
 * 使用原始 BoxJS JSON 挂载设置页。
 * Mount a settings page from raw BoxJS JSON.
 * @param boxjs 恰好包含一个模块的 BoxJS JSON / BoxJS JSON describing exactly one module.
 * @returns 模块视图 / Module view.
 */
export function mount(boxjs: BoxJSInput): MountedPreferences;
