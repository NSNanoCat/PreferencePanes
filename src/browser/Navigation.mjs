export { ActionMenu } from "./ActionMenu.mjs";
export { ModuleStatus, probeModule } from "./ModuleStatus.mjs";

/**
 * 同一文档内的首页、模块及字段子页导航。
 * Navigate homepage, module and field views within one document.
 */
export class Navigation extends EventTarget {
    #container;
    #home;
    #create;
    #window;
    #key = null;
    #view;
    #retiring;
    #controller;
    #animation;
    #scroll = new Map();
    #onHistory = () => this.#route();
    #onPageShow = event => {
        if (event.persisted) this.#route(true);
    };

    /**
     * 根视图始终保留；工厂按需提供子页，可用 signal 取消离开后的异步加载。
     * Retain the home view and create details on demand; signal cancels async work after departure.
     * @param {HTMLElement} container 由调用方布局的页面容器 / Caller-styled view container.
     * @param {HTMLElement} home 已创建的主页节点 / Existing home view.
     * @param {(key: string, signal: AbortSignal) => HTMLElement | undefined} create 子页工厂；未知路径返回 undefined / Detail factory; undefined for unknown routes.
     */
    constructor(container, home, create) {
        super();
        this.#container = container;
        this.#home = home;
        this.#create = create;
        this.#window = container.ownerDocument.defaultView;
        container.replaceChildren(home);
        this.#window.addEventListener("popstate", this.#onHistory);
        this.#window.addEventListener("hashchange", this.#onHistory);
        this.#window.addEventListener("pageshow", this.#onPageShow);
        this.#route();
    }

    /**
     * 当前子页键；空字符串表示主页。
     * Current detail key; empty means home.
     */
    get current() {
        return this.#key;
    }

    /**
     * 是否可以返回上一级或先前文档。
     * Whether a parent view or previous document is available.
     */
    get canGoBack() {
        return Boolean(this.#key) || this.#window.history.length > 1;
    }

    /**
     * 加入模块或字段子页历史，保留路由中的层级分隔符。
     * Push a module or field view while retaining route hierarchy separators.
     * @param {string} key 子页键 / Detail key.
     * @returns {void} 无返回值 / No return value.
     */
    open(key) {
        if (key === this.#key) return;
        const url = new URL(this.#window.location.href);
        url.hash = key.split("/").map(encodeURIComponent).join("/");
        this.#window.history.pushState({ ...this.#window.history.state, preferencePanesRoute: key }, "", url.href);
        this.#route();
    }

    /**
     * 沿文档历史返回，根页可退回上个文档。
     * Go back through document history, including the previous document from home.
     * @returns {void} 无返回值 / No return value.
     */
    back() {
        if (this.canGoBack) this.#window.history.back();
    }

    /**
     * 更新当前页的挂载视图，保留路由和滚动位置。
     * Refresh the mounted view while retaining route and scroll position.
     * @returns {void} 无返回值 / No return value.
     */
    refresh() {
        this.#route(true);
    }

    /**
     * 解析 URL 并统一处理页面切换、加载取消与动画结束后的释放。
     * Resolve the URL and coordinate transitions, cancellation and release after animation.
     * @param {boolean} [reload] 从页面缓存恢复时重新创建子页 / Recreate a detail after bfcache restoration.
     * @returns {void} 无返回值 / No return value.
     */
    #route(reload = false) {
        const url = new URL(this.#window.location.href);
        let key;
        try {
            key = decodeURIComponent(url.hash.slice(1));
        } catch (error) {
            if (!(error instanceof URIError)) throw error;
            key = "";
        }
        if (!reload && key === this.#key) return;
        if (key !== this.#key) this.#scroll.set(this.#key, (this.#view ?? this.#home).scrollTop);
        this.#controller?.abort();
        this.#controller = new AbortController();
        const next = key ? this.#create(key, this.#controller.signal) : undefined;
        if (!next) key = "";
        const history = this.#window.history;
        // 直接打开字段页时补齐首页和模块历史；刷新不重复堆叠。
        // Seed homepage and module history for direct field links without stacking on reload.
        if (url.hash && history.state?.preferencePanesRoute !== key) {
            url.hash = "";
            history.replaceState({ ...history.state, preferencePanesRoute: "" }, "", url.href);
            if (key) {
                const module = key.split("/")[0];
                if (key.includes("/") && module !== "$link") {
                    url.hash = encodeURIComponent(module);
                    history.pushState({ ...history.state, preferencePanesRoute: module }, "", url.href);
                }
                url.hash = key.split("/").map(encodeURIComponent).join("/");
                history.pushState({ ...history.state, preferencePanesRoute: key }, "", url.href);
            }
        }
        const previous = this.#view;
        if (previous === next && this.#key === key) {
            if (previous && this.#scroll.has(key)) {
                previous.scrollTop = this.#scroll.get(key);
                this.#scroll.delete(key);
            }
            this.dispatchEvent(new Event("change"));
            return;
        }
        const scroll = this.#scroll.get(key) ?? (key === this.#key ? (previous?.scrollTop ?? 0) : 0);
        const position = previous ? this.#window.getComputedStyle(previous).transform : "none";
        this.#animation?.cancel();
        this.#retiring?.remove();
        this.#retiring = previous;
        if (previous) {
            previous.inert = true;
        }
        this.#key = key;
        this.#view = next;
        this.#home.inert = Boolean(next);
        if (next) {
            next.inert = false;
            this.#container.append(next);
            next.scrollTop = scroll;
            // 加载占位页可能无法滚到原位置；配置与控件就绪后的 refresh 再恢复一次。
            // A loading placeholder may clamp scrolling; restore once more when config and controls refresh.
            if (next.scrollTop === scroll) this.#scroll.delete(key);
        }
        if (!next) {
            this.#home.scrollTop = this.#scroll.get("") ?? 0;
            this.#scroll.delete("");
        }
        const moving = next ?? previous;
        if (moving) {
            const animation = moving.animate([{ transform: next ? "translateX(100%)" : position }, { transform: next ? "translateX(0)" : "translateX(100%)" }], { duration: this.#window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" });
            this.#animation = animation;
            animation.onfinish = () => {
                if (this.#animation !== animation) return;
                this.#retiring?.remove();
                this.#retiring = undefined;
                animation.cancel();
                this.#animation = undefined;
            };
        }
        this.dispatchEvent(new Event("change"));
    }

    /**
     * 释放监听器、加载、动画和节点；调用方可重新创建导航。
     * Release listeners, loads, animations and nodes so callers can recreate navigation.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#window.removeEventListener("popstate", this.#onHistory);
        this.#window.removeEventListener("hashchange", this.#onHistory);
        this.#window.removeEventListener("pageshow", this.#onPageShow);
        this.#controller?.abort();
        this.#animation?.cancel();
        this.#retiring?.remove();
        this.#view?.remove();
        this.#home.remove();
    }
}
