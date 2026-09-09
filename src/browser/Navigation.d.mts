/**
 * 同一文档的根页/子页导航，不定义页面布局或模块业务。
 * Home/detail navigation within a document, without layout or module business rules.
 */
export class Navigation extends EventTarget {
    /**
     * 挂载根页并按 URL 创建子页；容器负责页面定位与背景样式。
     * Mount home and resolve details from the URL; the container owns positioning and backgrounds.
     * @param container 页面容器 / View container.
     * @param home 根页节点 / Home node.
     * @param create 子页工厂，signal 在离开时取消 / Detail factory; signal aborts on departure.
     */
    constructor(container: HTMLElement, home: HTMLElement, create: (key: string, signal: AbortSignal) => HTMLElement | undefined);
    /**
     * 当前键；空字符串表示根页。
     * Current key; empty means home.
     */
    readonly current: string;
    /**
     * 是否可以后退。
     * Whether back navigation is available.
     */
    readonly canGoBack: boolean;
    /**
     * 前进到子页。
     * Navigate to a detail.
     * @param key 子页键 / Detail key.
     * @returns 无返回值 / No return value.
     */
    open(key: string): void;
    /**
     * 沿联合历史后退。
     * Go back through joint history.
     * @returns 无返回值 / No return value.
     */
    back(): void;
    /**
     * 释放加载、监听器与视图。
     * Release loads, listeners and views.
     * @returns 无返回值 / No return value.
     */
    destroy(): void;
}
