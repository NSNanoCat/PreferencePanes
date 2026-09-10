/**
 * 原始 HTML 的模块 iframe 容器；通过元素传递请求上下文。
 * Iframe container preserving module HTML and carrying context on the element.
 * confirm 事件可 preventDefault 后通过 detail.resolve/reject 完成宿主确认。
 * Prevent default on confirm events and settle host dialogs through detail.resolve/reject.
 * notice 事件可 preventDefault 后交由宿主显示，模块不再创建网页 Toast。
 * Prevent default on notice events to display them in the host without a module web Toast.
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
    readonly state: { title: string; module: string; busy: boolean; canGoBack: boolean; actions: MenuAction[] };
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
     * 执行模块提供的菜单操作。
     * Perform a module-provided menu action.
     * @param id 操作标识 / Action identifier.
     * @returns 无返回值 / No return value.
     */
    perform(id: string): void;
    /**
     * 取消请求与事件订阅。
     * Cancel requests and subscriptions.
     * @returns 无返回值 / No return value.
     */
    destroy(): void;
}

/**
 * 宿主确认事件的数据。
 * Host confirmation event detail.
 */
export interface ConfirmationRequest {
    /**
     * 确认内容。
     * Confirmation message.
     */
    message: string;
    /**
     * 返回选择。
     * Return the user's choice.
     * @param confirmed 是否确认 / Whether confirmed.
     * @returns 无返回值 / No return value.
     */
    resolve(confirmed: boolean): void;
    /**
     * 返回失败。
     * Return a failure.
     * @param error 错误 / Error.
     * @returns 无返回值 / No return value.
     */
    reject(error: Error): void;
}

/**
 * 操作结果通知。
 * Operation result notice.
 */
export interface Notice {
    /**
     * 结果类型。
     * Result kind.
     */
    kind: "success" | "error";
    /**
     * 已格式化的提示文字。
     * Formatted notice text.
     */
    message: string;
}

/**
 * 菜单操作描述。
 * Menu action descriptor.
 */
export interface MenuAction {
    /**
     * 操作标识。
     * Action identifier.
     */
    id: string;
    /**
     * 显示文字。
     * Display text.
     */
    label: string;
    /**
     * 危险操作样式。
     * Destructive action style.
     */
    destructive?: boolean;
}

/**
 * 共用三点菜单。
 * Shared overflow menu.
 */
export class ActionMenu {
    /**
     * 创建菜单。
     * Create a menu.
     * @param select 选择回调 / Selection callback.
     */
    constructor(select: (id: string) => void);
    /**
     * 菜单节点。
     * Menu element.
     */
    readonly element: HTMLElement;
    /**
     * 更新操作列表。
     * Update available actions.
     * @param items 操作列表 / Actions.
     * @param disabled 是否忙碌 / Busy state.
     * @returns 无返回值 / No return value.
     */
    update(items: MenuAction[], disabled?: boolean): void;
    /**
     * 打开当前操作菜单。
     * Open the current action sheet.
     * @returns 无返回值 / No return value.
     */
    open(): void;
    /**
     * 关闭菜单。
     * Close the menu.
     * @returns 无返回值 / No return value.
     */
    close(): void;
    /**
     * 释放组件。
     * Release the component.
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
