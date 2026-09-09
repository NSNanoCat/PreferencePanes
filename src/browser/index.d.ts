import type { BoxJSInput } from "../index.js";

/**
 * 整个设置应用的生命周期句柄。
 * Lifecycle handle for the complete preferences application.
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
 * 仅以 BoxJS 和可选 CSS 挂载完整设置应用。
 * Mount the complete settings application using only BoxJS and optional CSS.
 * @param boxjs BoxJS JSON / BoxJS JSON.
 * @param css 可选 CSS 正文；默认样式始终内置 / Optional CSS text; default styles are built in.
 * @returns 生命周期句柄 / Lifecycle handle.
 */
export function mount(boxjs: BoxJSInput, css?: string): MountedPreferences;
