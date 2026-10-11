import { normalizeBoxJs } from "./boxjs.mjs";
import { element, statusView } from "./components.mjs";
import { Navigation } from "./Navigation.mjs";
import { PreferencesPanel } from "./panel.mjs";

/**
 * 浏览器宿主提供网页导航、通知、主题和可视区域避让。
 * The browser host provides web navigation, notices, theme and viewport clearance.
 * @param {import("./home.mjs").BridgeOptions} options 菜单和返回动作 / Menu and back action.
 * @returns {import("./home.mjs").Bridge} 浏览器宿主 / Browser host.
 */
export function browserHost({ menu, back }) {
    const root = document.documentElement;
    const header = document.createElement("header");
    header.className = "pp-host-header";
    const button = document.createElement("button");
    button.className = "pp-host-back";
    button.type = "button";
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
    button.setAttribute("aria-label", "返回");
    button.onclick = back;
    const left = document.createElement("span");
    left.className = "pp-host-left";
    left.append(button);
    const title = document.createElement("span");
    title.className = "pp-host-title";
    const brand = document.createElement("div");
    brand.className = "pp-host-brand";
    const brandLink = document.createElement("a");
    brandLink.className = "pp-host-brand-link";
    const logo = document.createElement("span");
    logo.className = "pp-host-logo";
    const image = document.createElement("img");
    image.alt = "logo";
    logo.append(image);
    brandLink.append(logo, title);
    brand.append(brandLink);
    header.append(left, brand, menu.element);
    document.body.prepend(header);
    const toast = document.createElement("div");
    toast.className = "pp-host-toast";
    toast.setAttribute("role", "status");
    toast.hidden = true;
    document.body.append(toast);
    let timer;
    const theme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
        root.dataset.theme = theme.matches ? "dark" : "light";
    };
    const viewport = window.visualViewport;
    const resize = () => {
        root.style.setProperty("--pp-host-height", `${header.getBoundingClientRect().height}px`);
        const clearance = viewport && viewport.scale === 1 ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
        root.style.setProperty("--pp-keyboard-height", `${clearance}px`);
    };
    const scroll = () => {
        const pages = document.querySelector("[data-preference-panes-pages]");
        const current = [...pages.children].find(view => !view.inert);
        header.classList.toggle("pp-scrolled", (current?.scrollTop ?? 0) >= 100);
    };
    document.addEventListener("scroll", scroll, true);
    theme.addEventListener("change", applyTheme);
    window.addEventListener("resize", resize);
    window.addEventListener("pageshow", resize);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    applyTheme();
    resize();
    return {
        update(state) {
            title.textContent = state.logoText ?? state.title;
            brandLink.href = state.logoHref ?? "/";
            logo.hidden = !state.logo;
            if (state.logo) image.src = state.logo;
            menu.element.hidden = !state.actions.length;
            button.disabled = state.busy || !state.canGoBack;
            scroll();
        },
        confirm: message => window.confirm(message),
        notice(detail) {
            clearTimeout(timer);
            toast.textContent = detail.message;
            toast.hidden = false;
            timer = setTimeout(() => {
                toast.hidden = true;
            }, 2400);
        },
        openURL(url, target) {
            switch (target) {
                case "_blank":
                    window.open(url, "_blank", "noopener,noreferrer");
                    break;
                default:
                    window.location.assign(url);
                    break;
            }
        },
        destroy() {
            clearTimeout(timer);
            document.removeEventListener("scroll", scroll, true);
            theme.removeEventListener("change", applyTheme);
            window.removeEventListener("resize", resize);
            window.removeEventListener("pageshow", resize);
            viewport?.removeEventListener("resize", resize);
            viewport?.removeEventListener("scroll", resize);
            root.style.removeProperty("--pp-host-height");
            root.style.removeProperty("--pp-keyboard-height");
            delete root.dataset.theme;
            header.remove();
            toast.remove();
        },
    };
}

/**
 * 一个文档共享宿主、路由和当前模块会话，字段子页不重新读取配置。
 * Share one host, router and module session within a document without reloading config for field views.
 */
export class PageController {
    #navigation;
    #host;
    #menu;
    #title;
    #logo;
    #logoText;
    #logoHref;
    #modules;
    #links;
    #session;
    #destroyed = false;

    /**
     * 接管已初始化的宿主与首页；此接口仅供包内入口组合。
     * Own an initialized host and homepage; this interface is only used by internal entry points.
     * @param {HTMLElement} container 页面容器 / Page container.
     * @param {HTMLElement} home 首页节点 / Homepage node.
     * @param {object} options 宿主、菜单、品牌及入口 / Host, menu, brand and entries.
     */
    constructor(container, home, { host, menu, title, logo, logoText, logoHref, modules, links = [] }) {
        this.#host = host;
        this.#menu = menu;
        this.#title = title;
        this.#logo = logo;
        this.#logoText = logoText || (logo ? "" : title);
        this.#logoHref = logoHref;
        this.#modules = modules;
        this.#links = links;
        this.#navigation = new Navigation(container, home, (key, signal) => this.#view(key, signal));
        this.#navigation.addEventListener("change", () => this.update());
        this.update();
    }

    /**
     * 创建模块会话或复用其字段页；外部网站才使用 iframe。
     * Create a module session or reuse a field view; only external sites use an iframe.
     * @param {string} key 路由键 / Route key.
     * @param {AbortSignal} signal 当前外链视图的取消信号 / Cancellation signal for the current external view.
     * @returns {HTMLElement | undefined} 视图；未知模块返回 undefined / View; undefined for unknown modules.
     */
    #view(key, signal) {
        const [module, ...parts] = key.split("/");
        const view = parts.join("/");
        if (module !== this.#session?.module) {
            this.#session?.controller.abort();
            this.#session?.panel?.destroy();
            this.#session = undefined;
        }
        if (module === "$link") {
            const link = this.#links[Number(view)];
            if (!link || link.dataset.target !== "internal") return;
            const page = element("section", "pp-link-page");
            const iframe = element("iframe", "");
            iframe.title = link.querySelector(".pp-home-name").textContent;
            iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
            iframe.src = link.href;
            page.append(iframe);
            signal.addEventListener("abort", () => iframe.remove(), { once: true });
            return page;
        }
        const entry = this.#modules.get(module);
        if (!entry) return;
        if (!this.#session) {
            const controller = new AbortController();
            const root = element("section", "pp-module-page");
            const session = { module, root, controller };
            this.#session = session;
            const load = async () => {
                if (controller.signal.aborted) return;
                root.replaceChildren(statusView("正在打开设置…"));
                try {
                    let boxjs = entry.boxjs;
                    if (!boxjs) {
                        const response = await fetch(`/api/${encodeURIComponent(module)}`, { cache: "no-store", signal: controller.signal });
                        if (!response.ok) throw new Error(`配置加载失败：HTTP ${response.status}`);
                        boxjs = await response.json();
                    }
                    if (controller.signal.aborted) return;
                    root.replaceChildren();
                    session.panel = new PreferencesPanel(root, normalizeBoxJs(boxjs), this);
                    this.update();
                } catch (error) {
                    if (controller.signal.aborted) return;
                    root.replaceChildren(statusView(`加载失败：${error.message}`, load));
                }
            };
            // 已提供 BoxJS 时也等待路由切换完成，再发布表单状态。
            // Wait for routing to finish before publishing form state, even with supplied BoxJS.
            queueMicrotask(load);
        }
        return this.#session.panel?.view(view) ?? this.#session.root;
    }

    /**
     * 同步唯一标题栏与菜单；离开模块时终止读取和会话。
     * Synchronize the only title bar and menu, ending reads and sessions on departure.
     * @returns {void} 无返回值 / No return value.
     */
    update() {
        if (this.#destroyed || !this.#navigation) return;
        const [module, ...parts] = this.#navigation.current.split("/");
        if (!module && this.#session) {
            this.#session.controller.abort();
            this.#session.panel?.destroy();
            this.#session = undefined;
        }
        const state = this.#session?.panel?.state(parts.join("/")) ?? {
            title: module === "$link" ? this.#links[Number(parts[0])].querySelector(".pp-home-name").textContent : (this.#modules.get(module)?.name ?? this.#title),
            actions: [],
            busy: false,
        };
        document.title = state.title;
        this.#menu.update(state.actions, state.busy);
        Promise.resolve(this.#host.update({ ...state, logo: module ? undefined : this.#logo, logoText: module ? undefined : this.#logoText, logoHref: this.#logoHref, canGoBack: this.#navigation.canGoBack })).catch(error => this.notice({ kind: "error", message: error.message }));
    }

    /**
     * 控件重建后重新解析当前路由，不增加历史或重新加载模块配置。
     * Resolve the current route after rebuilding controls without adding history or reloading config.
     * @returns {void} 无返回值 / No return value.
     */
    refresh() {
        if (!this.#destroyed) this.#navigation.refresh();
    }

    /**
     * 打开当前模块的字段或操作子页。
     * Open a field or action subview of the current module.
     * @param {string} view 子页键 / Detail key.
     * @returns {void} 无返回值 / No return value.
     */
    open(view) {
        this.#navigation.open(`${this.#session.module}/${view}`);
    }

    /**
     * 执行当前表单操作。
     * Perform an action on the current form.
     * @param {string} id 操作标识 / Action identifier.
     * @returns {void} 无返回值 / No return value.
     */
    perform(id) {
        this.#session?.panel?.perform(id);
    }

    /**
     * 请求宿主确认；退出后忽略晚到的选择。
     * Request host confirmation and ignore a late choice after departure.
     * @param {string} message 确认文字 / Confirmation message.
     * @returns {Promise<boolean>} 用户选择 / User choice.
     */
    async confirm(message) {
        const session = this.#session;
        const confirmed = await this.#host.confirm(message);
        return !this.#destroyed && session === this.#session && confirmed;
    }

    /**
     * 由唯一宿主显示通知。
     * Display a notice through the only host.
     * @param {import("./Navigation.mjs").Notice} detail 已格式化通知 / Formatted notice.
     * @returns {void} 无返回值 / No return value.
     */
    notice(detail) {
        if (!this.#destroyed) this.#host.notice(detail);
    }

    /**
     * 由宿主执行标准外链导航。
     * Delegate standard external navigation to the host.
     * @param {string} url 完整地址 / Absolute URL.
     * @param {"_self" | "_blank"} [target] 打开方式 / Opening mode.
     * @returns {void} 无返回值 / No return value.
     */
    openURL(url, target) {
        try {
            Promise.resolve(this.#host.openURL(url, target)).catch(error => this.notice({ kind: "error", message: error.message }));
        } catch (error) {
            this.notice({ kind: "error", message: error.message });
        }
    }

    /**
     * 共用首页与表单导航。
     * Navigation shared by the homepage and forms.
     */
    get navigation() {
        return this.#navigation;
    }

    /**
     * 结束页面能力和会话；表单写入队列自行收尾。
     * End page capabilities and sessions while forms finish their write queues.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;
        this.#session?.controller.abort();
        this.#session?.panel?.destroy();
        this.#navigation.destroy();
        this.#host.destroy();
        this.#menu.destroy();
    }
}
