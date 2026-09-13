import type { ModuleModel } from "../index.js";

/**
 * 具体模块设置页的生命周期句柄。
 * Lifecycle handle for a concrete module settings page.
 */
export interface MountedPreferences {
    /** 移除页面、样式和监听器 / Remove page, styles and listeners. */
    destroy(): void;
}
/**
 * 管理模块设置视图的模型、样式、主题和面板生命周期。
 * Manage model, styles, theme, and panel lifecycle for a module settings view.
 */
export class PreferencesView implements MountedPreferences {
    /**
     * 使用模块 API 返回的模型挂载设置页。
     * Mount a settings page from the model returned by the module API.
     * @param model 模块 API 模型 / Module API model.
     * @param css 可选 CSS 正文 / Optional CSS text.
     */
    constructor(model: ModuleModel, css?: string);
    /** 移除页面、样式和监听器 / Remove page, styles and listeners. */
    destroy(): void;
}
/**
 * 使用模块 API 返回的模型挂载设置页；CSS 仅覆盖当前模块。
 * Mount a settings page from a module API model; CSS only overrides this module.
 * @param model 模块 API 模型 / Module API model.
 * @param css 可选 CSS 正文 / Optional CSS text.
 * @returns 模块视图 / Module view.
 */
export function mount(model: ModuleModel, css?: string): PreferencesView;
