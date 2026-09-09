/**
 * 原始 HTML 的模块 iframe 容器；通过元素传递请求上下文。
 * Iframe container preserving module HTML and carrying context on the element.
 */
export class ModuleFrame extends EventTarget {
    /**
     * 创建容器。
     * Create a container.
     * @param url 模块地址 / Module URL.
     * @param options 原生请求参数 / Native request options.
     */
    constructor(url: string | URL, options?: RequestInit);
    /**
     * 宿主挂载节点。
     * Host-mounted element.
     */
    readonly element: HTMLIFrameElement;
    /**
     * change 事件对应的导航状态。
     * Navigation state exposed with change events.
     */
    readonly state: { title: string; module: string; busy: boolean; canGoBack: boolean };
    /**
     * 获取原始 HTML。
     * Fetch unmodified HTML.
     * @returns 加载完成 / Load completion.
     */
    load(): Promise<void>;
    /**
     * 沿模块历史返回。
     * Go back through module history.
     * @returns 无返回值 / No return value.
     */
    back(): void;
    /**
     * 取消请求与事件订阅。
     * Cancel requests and subscriptions.
     * @returns 无返回值 / No return value.
     */
    destroy(): void;
}

/**
 * HEAD 探测的固定模块状态行。
 * Fixed module status row backed by HEAD probes.
 */
export class ModuleStatus extends EventTarget {
    /**
     * 绑定状态行。
     * Bind a status row.
     * @param element 状态行节点 / Status row node.
     */
    constructor(element: HTMLElement);
    /**
     * 当前状态及模块版本。
     * Current state and module version.
     */
    readonly state: { status: "checking" | "installed" | "missing"; version: string | null };
    /**
     * 探测配置 Mock。
     * Probe a configuration Mock.
     * @param url 配置地址 / Configuration URL.
     * @returns 探测完成 / Probe completion.
     */
    check(url: string | URL): Promise<void>;
    /**
     * 取消探测。
     * Cancel probes.
     * @returns 无返回值 / No return value.
     */
    destroy(): void;
}

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
