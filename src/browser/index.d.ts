import type { ModuleModel } from "../index.js";

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
 * 仅以代理 API 返回的模块模型和可选 CSS 挂载一个模块页，不生成项目主页。
 * Mount one module page using a proxy API model and optional CSS, without generating a project landing page.
 * @param model 代理 API 返回的模块模型 / Module model returned by the proxy API.
 * @param css 可选 CSS 正文；默认样式始终内置 / Optional CSS text; default styles are built in.
 * @returns 生命周期句柄 / Lifecycle handle.
 */
export function mount(model: ModuleModel, css?: string): MountedPreferences;
