/**
 * Bilibili common WebView 的官方 JSBridge 适配器。
 * Official JSBridge adapter for Bilibili common WebViews.
 */
export class BilibiliHost {
    #bridge;
    #select;
    #state = { title: "", actions: [], busy: false };
    #revision = 0;
    #queue = Promise.resolve();
    #destroyed = false;
    #document;
    #navigation = result => {
        if (result.code !== 0 || result.data?.id !== "preference-panes.more" || this.#state.busy || this.#state.actions.length === 0) return;
        const revision = this.#revision;
        const actions = this.#state.actions;
        this.#bridge
            .useNative("liveUI.selectPanel", {
                title: "更多操作",
                options: actions.map(action => ({ text: action.label, value: action.id })),
            })
            .then(result => {
                if (this.#destroyed || revision !== this.#revision || this.#state.busy) return;
                const action = actions.find(item => item.id === result.data.text);
                if (action) this.#select(action.id);
            });
    };
    #theme = result => {
        if (result.code === 0 && result.data?.theme) this.#applyTheme(result.data.theme);
    };
    #keyboard = result => {
        if (result.code === 0 && typeof result.data?.status === "boolean") this.#document.documentElement.style.setProperty("--pp-keyboard-height", `${result.data.status ? result.data.height : 0}px`);
    };

    /**
     * 连接页面已加载的官方 SDK。
     * Connect to the official SDK already loaded by the document.
     * @param {(id: string) => void} select 模块菜单回调 / Module action callback.
     * @param {Window} [host] Bilibili WebView 窗口 / Bilibili WebView window.
     */
    constructor(select, host = window) {
        this.#bridge = host.biliBridge;
        this.#select = select;
        this.#document = host.document;
        this.#applyTheme(host.navigator.userAgent.includes("themeId/2") ? 2 : 1);
        this.ready = this.#connect();
    }

    /**
     * 初始化主题、键盘和原生导航通道。
     * Initialize theme, keyboard and native navigation channels.
     * @returns {Promise<void>} 初始化完成 / Initialization completion.
     */
    async #connect() {
        await this.#bridge.initPromise;
        if (!this.#bridge.isWbTypeCommon) throw new Error("PreferencePanes requires a Bilibili common WebView");
        this.#bridge.addChannel("ui.observeThemeChange", this.#theme, { immediately: true });
        this.#bridge.addChannel("ui.observeKeyboardStatus", this.#keyboard);
        this.#bridge.addChannel("ui.observeNavigationClick", this.#navigation);
        await this.#bridge.useNative("ui.setNavigationHide", { hide: false });
    }

    /**
     * 同步官方导航标题和更多按钮。
     * Synchronize the official navigation title and overflow button.
     * @param {{title: string, actions: Array<{id: string, label: string}>, busy: boolean}} state 页面状态 / Page state.
     * @returns {Promise<void>} 更新完成 / Update completion.
     */
    update(state) {
        this.#state = state;
        const revision = ++this.#revision;
        const render = async () => {
            await this.ready;
            if (this.#destroyed || revision !== this.#revision) return;
            await this.#bridge.useNative("ui.setTitle", { title: state.title });
            if (this.#destroyed || revision !== this.#revision) return;
            await this.#bridge.useNative("ui.setNavigationButton", {
                buttons: !state.busy && state.actions.length ? [{ id: "preference-panes.more", type: 3, visible: true }] : [],
            });
        };
        this.#queue = this.#queue.then(render, render);
        return this.#queue;
    }

    /**
     * 显示官方确认面板。
     * Show the official confirmation panel.
     * @param {string} message 确认内容 / Confirmation message.
     * @returns {Promise<boolean>} 用户是否确认 / Whether the user confirmed.
     */
    async confirm(message) {
        await this.ready;
        return new Promise((resolve, reject) =>
            this.#bridge.callNative({
                method: "ability.alert",
                data: { type: "confirm", title: this.#state.title, message, confirmButton: "确定", cancelButton: "取消" },
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
                onNeutral: () => resolve(false),
                callback: result => {
                    if (result instanceof Error || result === "error") reject(new Error("Native confirmation failed"));
                },
            }),
        );
    }

    /**
     * 显示官方短提示。
     * Show an official short notice.
     * @param {string} message 提示内容 / Notice message.
     * @returns {Promise<void>} 提示已提交 / Notice dispatched.
     */
    async notice(message) {
        await this.ready;
        await this.#bridge.useNative("liveUI.toast", { type: "short", msg: message });
    }

    /**
     * 释放官方事件通道。
     * Release official event channels.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#destroyed = true;
        this.#revision++;
        this.#bridge.removeChannel("ui.observeThemeChange", this.#theme);
        this.#bridge.removeChannel("ui.observeKeyboardStatus", this.#keyboard);
        this.#bridge.removeChannel("ui.observeNavigationClick", this.#navigation);
    }

    /**
     * 将官方主题值映射到页面主题标记。
     * Map the official theme value to document theme markers.
     * @param {number | string} value 官方主题值 / Official theme value.
     * @returns {void} 无返回值 / No return value.
     */
    #applyTheme(value) {
        const dark = value === 2 || value === "dark";
        this.#document.documentElement.dataset.theme = dark ? "dark" : "light";
        this.#document.documentElement.classList.toggle("bili_dark", dark);
    }
}
