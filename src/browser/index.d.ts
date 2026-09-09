import type { BoxJSInput } from "../index.js";

/**
 * 具体模块设置页的生命周期句柄。
 * Lifecycle handle for a concrete module settings page.
 */
export interface MountedPreferences {
    /**
     * 移除页面、样式、监听器和临时会话。
     * Remove the page, styles, listeners and transient sessions.
     * @returns 无返回值 / No return value.
     */
    destroy(): void;
}
/**
 * 仅以 BoxJS 和可选 CSS 挂载一个模块页，不生成项目主页。
 * Mount one module page using BoxJS and optional CSS, without a project landing page.
 * @param boxjs 恰好包含一个模块的 BoxJS JSON / BoxJS JSON describing exactly one module.
 * @param css 可选 CSS 正文；默认样式始终内置 / Optional CSS text; default styles are built in.
 * @returns 生命周期句柄 / Lifecycle handle.
 */
export function mount(boxjs: BoxJSInput, css?: string): MountedPreferences;
