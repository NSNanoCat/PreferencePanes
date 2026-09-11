import { ActionMenu } from "./ActionMenu.mjs";
import { createPreferencesClient } from "./client.mjs";
import { fieldControl, element as node, requestConfirmation, resourceURL, settingRow, statusView } from "./components.mjs";
import { Navigation } from "./Navigation.mjs";

/**
 * 挂载已导入 BoxJS 对应的模块表单和短暂通知。
 * Mount the imported BoxJS module form and transient notifications.
 * @param {HTMLElement} root 包内挂载元素 / Internal mount element.
 * @param {import("../BoxJS.mjs").BoxJS} catalog 包内 BoxJS 目录 / Internal BoxJS catalog.
 * @returns {import("./index.js").MountedPreferences} 面板生命周期句柄 / Panel lifecycle handle.
 */
export function mountPanel(root, catalog) {
    const title = catalog.module.metadata.name ?? catalog.module.module;
    const document = root.ownerDocument;
    const window = document.defaultView;
    const shell = node("div", "pp-panel");
    shell.dataset.module = catalog.module.module;
    const header = node("header", "pp-header");
    const back = node("button", "pp-back", "‹");
    back.setAttribute("aria-label", "返回");
    back.type = "button";
    const heading = node("h1", "pp-title", title);
    const handlers = new Map();
    const menuItems = [
        { id: "viewSettings", label: "查看设置" },
        { id: "viewCaches", label: "查看缓存" },
        { id: "clearCaches", label: "清空缓存", destructive: true },
        { id: "reset", label: "重置模块", destructive: true },
    ];
    const menu = new ActionMenu(id => runAction(id));
    const trailing = node("span", "pp-nav-spacer");
    trailing.append(menu.element);
    const viewport = node("div", "pp-viewport");
    let toast;
    header.append(back, heading, trailing);
    shell.append(header, viewport);
    root.append(shell);
    // 嵌入模式向宿主发布导航状态，宿主不读取或修改模块内部 DOM。
    // Embedded mode publishes navigation state without host reads or mutations of the module DOM.
    const publishNavigation = () => {
        const actions = handlers.size ? menuItems : [];
        menu.update(actions, saving);
        const frame = window.frameElement;
        if (!frame?.dataset.preferencePanes) return;
        frame.dispatchEvent(
            new frame.ownerDocument.defaultView.CustomEvent("preferencepanes:change", {
                detail: { title: heading.textContent, module: catalog.module.module, busy: saving, canGoBack: !back.disabled, actions },
            }),
        );
    };
    const onAction = event => {
        if (!saving && handlers.has(event.detail)) runAction(event.detail);
    };
    window.frameElement?.addEventListener("preferencepanes:action", onAction);
    let timer,
        navigation,
        generation = 0,
        active = null,
        saving = false,
        destroyed = false;
    /**
     * 展示短暂通知，不刷新设置数据。
     * Display a transient notification without refreshing settings.
     * @param {{kind: "success" | "error", operation?: "write" | "delete" | "clearCaches" | "reset", message?: string}} event 操作结果 / Operation result.
     * @returns {void} 无返回值 / No return value.
     */
    const notify = event => {
        if (destroyed) return;
        let message;
        switch (true) {
            case event.kind === "error":
                message = `操作失败：${event.message}`;
                break;
            case event.operation === "delete":
                message = "删除成功";
                break;
            case event.operation === "clearCaches":
                message = "Caches 已清空";
                break;
            case event.operation === "reset":
                message = "模块已重置";
                break;
            default:
                message = "修改成功";
                break;
        }
        // 宿主接管时不创建网页 Toast，也不运行其计时器。
        // A host-owned notice creates no web Toast and starts no local timer.
        const frame = window.frameElement;
        if (frame && !frame.dispatchEvent(new frame.ownerDocument.defaultView.CustomEvent("preferencepanes:notice", { cancelable: true, detail: { kind: event.kind, message } }))) return;
        if (!toast) {
            toast = node("div", "pp-toast");
            toast.setAttribute("role", "status");
            shell.append(toast);
        }
        toast.textContent = message;
        toast.dataset.kind = event.kind;
        toast.hidden = false;
        clearTimeout(timer);
        timer = setTimeout(() => {
            toast.hidden = true;
        }, 2400);
    };
    const client = createPreferencesClient({ catalog, notify });
    /**
     * 两种菜单入口共用异步错误处理，包含宿主确认框错误。
     * Share async error handling between both menus, including host-dialog errors.
     * @param {string} id 操作标识 / Action identifier.
     * @returns {Promise<void>} 操作已处理 / Action handled.
     */
    async function runAction(id) {
        try {
            await handlers.get(id)();
        } catch (error) {
            notify({ kind: "error", message: error.message });
        }
    }
    /**
     * 打开模块并忽略已过期的异步结果。
     * Open a module and ignore stale asynchronous results.
     * @param {string} module 模块标识 / Module identifier.
     * @returns {Promise<void>} 视图加载完成，失败显示错误视图 / View load completion; failures display an error view.
     */
    async function open(module) {
        const version = ++generation;
        active = module;
        back.disabled = window.history.length <= 1;
        heading.textContent = module;
        publishNavigation();
        viewport.replaceChildren(statusView("读取设置…"));
        try {
            await client.open(module);
            if (version === generation) controls();
        } catch (error) {
            if (version !== generation) return;
            viewport.replaceChildren(statusView(`加载失败：${error.message}`, () => open(module)));
            publishNavigation();
        }
    }
    /**
     * 从会话快照创建控件与操作按钮，不重新读取网络配置。
     * Build controls and actions from the session snapshot without fetching config again.
     * @returns {void} 无返回值 / No return value.
     */
    function controls() {
        const { definition, values } = client.snapshot(active);
        heading.textContent = definition.metadata?.name || active;
        const view = node("section", "pp-fields");
        /**
         * 挂载后执行的多行高度更新
         * Textarea sizing callbacks run after mounting.
         * @type {Array<() => void>}
         */
        const growingInputs = [];
        const editors = new Map();
        const summaries = [];
        const groups = new Map();
        let queue = Promise.resolve(),
            pendingWrites = 0;
        /**
         * 导航组件处理页面切换，表单只更新当前标题与返回按钮。
         * Let navigation own transitions; the form only updates the title and back button.
         * @returns {void} 无返回值 / No return value.
         */
        const updateNavigation = () => {
            const editor = editors.get(navigation.current);
            heading.textContent = editor?.title ?? definition.metadata?.name ?? active;
            back.disabled = saving || !navigation.canGoBack;
            publishNavigation();
        };
        /**
         * 串行执行模块操作，保持输入可编辑。
         * Serialize module actions while keeping inputs editable.
         * @param {() => Promise<void>} action 请求或写入 / Request or mutation.
         * @param {() => void} success 成功后的局部更新 / Local update after success.
         * @param {() => void} [failure] 失败后恢复当前输入 / Restore the current input on failure.
         * @returns {Promise<void>} 操作完成 / Operation completion.
         */
        function perform(action, success, failure = () => {}) {
            pendingWrites++;
            saving = true;
            back.disabled = true;
            publishNavigation();
            return (queue = queue
                .then(action)
                .then(() => {
                    if (!destroyed) success();
                })
                .catch(() => {
                    /* 请求层已通知错误。
                     * The request layer has already reported the error. */
                    if (!destroyed) failure();
                })
                .finally(() => {
                    pendingWrites--;
                    saving = pendingWrites > 0;
                    if (destroyed && !saving) client.leave(active);
                    back.disabled = saving || !navigation.canGoBack;
                    publishNavigation();
                }));
        }
        const metadata = definition.metadata;
        if (metadata) {
            const info = node("div", "pp-module-info");
            const details = node("div", "pp-module-details");
            for (const description of [metadata.author, metadata.desc ?? metadata.description, ...(metadata.descs ?? [])]) if (description) details.append(node("p", "pp-description", description));
            if (metadata.repo) {
                const link = node("a", "pp-module-source", "项目主页");
                link.href = resourceURL(metadata.repo);
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                details.append(link);
            }
            info.append(details);
            view.append(info);
        }
        for (const field of definition.fields) {
            const match = /^\[([^\]]+)\]\s*(.*)$/.exec(field.name);
            const group = match?.[1] ?? "通用";
            if (!groups.has(group)) {
                const section = node("section", "pp-group");
                const rows = node("div", "pp-rows");
                section.append(node("h2", "pp-group-title", group), rows);
                groups.set(group, rows);
                view.append(section);
            }
            const row = settingRow("div");
            row.classList.add("pp-field");
            const label = node("div", "pp-label");
            label.append(node("span", "pp-field-name", match?.[2] ?? field.name));
            if (field.description) label.append(node("span", "pp-field-description", field.description));
            row.append(label);
            const value = values[field.key];
            /**
             * 读取尚未保存的输入
             * Read the unsaved input.
             * @type {() => unknown}
             */
            let read;
            /**
             * 更新当前控件
             * Update the current control.
             * @type {(value: unknown) => void}
             */
            let write;
            let inputContainer = row;
            let eventName = "change";
            switch (true) {
                case Boolean(field.options) && field.type !== "array": {
                    const select = node("select", "");
                    select.setAttribute("aria-label", field.name);
                    field.options.forEach((option, index) => {
                        const item = node("option", "", option.label);
                        item.value = String(index);
                        select.append(item);
                    });
                    write = value => {
                        select.selectedIndex = field.options.findIndex(option => option.key === value);
                    };
                    row.append(fieldControl(select));
                    read = () => field.options[select.selectedIndex]?.key;
                    break;
                }
                case field.type === "array" && Boolean(field.options): {
                    const page = node("section", "pp-choice-page");
                    if (field.description) page.append(node("p", "pp-description", field.description));
                    const choices = node("div", "pp-rows");
                    page.append(choices);
                    inputContainer = choices;
                    editors.set(field.key, { node: page, title: match?.[2] ?? field.name });
                    const summary = node("span", "pp-summary");
                    const link = node("button", "pp-choice-link");
                    link.type = "button";
                    link.setAttribute("aria-label", field.name);
                    link.append(summary, node("span", "pp-chevron", "›"));
                    row.append(link);
                    const refresh = () => {
                        const value = client.snapshot(active).values[field.key];
                        summary.textContent =
                            field.options
                                .filter(option => Array.isArray(value) && value.includes(option.key))
                                .map(option => option.label)
                                .join("、") || "未选择";
                    };
                    summaries.push(refresh);
                    refresh();
                    link.onclick = () => navigation.open(field.key);
                    row.addEventListener("click", event => {
                        if (!link.contains(event.target)) link.click();
                    });
                    const inputs = field.options.map(option => {
                        const label = settingRow("label");
                        label.classList.add("pp-choice");
                        label.textContent = option.label;
                        const input = node("input", "");
                        input.type = "checkbox";
                        input.setAttribute("aria-label", option.label);
                        label.append(input);
                        choices.append(label);
                        return { input, key: option.key };
                    });
                    read = () => inputs.filter(option => option.input.checked).map(option => option.key);
                    write = value => {
                        for (const option of inputs) option.input.checked = Array.isArray(value) && value.includes(option.key);
                    };
                    break;
                }
                case field.type === "boolean": {
                    const toggle = node("input", "pp-switch");
                    toggle.type = "checkbox";
                    toggle.setAttribute("switch", "");
                    toggle.setAttribute("role", "switch");
                    toggle.setAttribute("aria-label", field.name);
                    write = value => {
                        toggle.checked = value === true;
                    };
                    read = () => toggle.checked;
                    row.append(toggle);
                    break;
                }
                default: {
                    const multiline = field.control === "textarea" || field.type === "array";
                    const input = node(multiline ? "textarea" : "input", "");
                    if (multiline) row.classList.add("pp-multiline");
                    input.setAttribute("aria-label", field.name);
                    if (field.placeholder) input.placeholder = field.placeholder;
                    if (multiline && field.rows) input.rows = field.rows;
                    /**
                     * 在挂载后根据内容调整高度，同时保留基础行数。
                     * Size mounted textareas to their contents while retaining baseline rows.
                     * @returns {void} 无返回值 / No return value.
                     */
                    const grow = () => {
                        if (!multiline || !field.autoGrow || !input.isConnected) return;
                        input.style.height = "auto";
                        const baseline = input.getBoundingClientRect().height;
                        const style = window.getComputedStyle(input);
                        const borders = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
                        input.style.height = `${Math.max(baseline, input.scrollHeight + borders)}px`;
                    };
                    if (multiline && field.autoGrow) {
                        input.addEventListener("input", grow);
                        growingInputs.push(grow);
                    }
                    eventName = "input";
                    if (!multiline) input.type = field.type === "number" ? "number" : "text";
                    write = value => {
                        input.value = field.type === "array" ? JSON.stringify(value ?? []) : (value ?? "");
                        grow();
                    };
                    read = () => {
                        switch (field.type) {
                            case "array":
                                return JSON.parse(input.value);
                            case "number":
                                return input.value === "" ? Number.NaN : Number(input.value);
                            default:
                                return input.value;
                        }
                    };
                    row.append(fieldControl(input));
                    break;
                }
            }
            write(value);
            let inputVersion = 0;
            inputContainer.addEventListener(eventName, event => {
                if (event.isComposing) return;
                const version = ++inputVersion,
                    module = active;
                let value;
                try {
                    value = read();
                } catch (error) {
                    notify({ kind: "error", message: error.message });
                    return;
                }
                const restore = () => {
                    if (version === inputVersion) write(client.snapshot(module).values[field.key]);
                };
                perform(
                    () => client.set(module, field.key, value),
                    () => {
                        for (const refresh of summaries) refresh();
                    },
                    restore,
                );
            });
            if (eventName === "input") inputContainer.addEventListener("compositionend", event => event.target.dispatchEvent(new window.Event("input", { bubbles: true })));
            groups.get(group).append(row);
        }
        const settingsPage = node("section", "pp-settings-page");
        const settingsOutput = node("pre", "pp-cache");
        settingsOutput.setAttribute("aria-label", "Settings 内容");
        settingsPage.append(settingsOutput);
        editors.set("$settings", { node: settingsPage, title: "设置" });
        handlers.set("viewSettings", () => {
            if (saving) return;
            settingsOutput.textContent = JSON.stringify(client.snapshot(active).values, null, 2);
            navigation.open("$settings");
        });
        const cachePage = node("section", "pp-cache-page");
        const output = node("pre", "pp-cache");
        output.textContent = "暂无缓存";
        output.setAttribute("aria-label", "Caches 内容");
        cachePage.append(output);
        editors.set("$caches", { node: cachePage, title: "缓存" });
        handlers.set("viewCaches", () => {
            if (saving) return;
            let value;
            return perform(
                async () => {
                    try {
                        value = await client.readCaches(active);
                    } catch (error) {
                        notify({ kind: "error", message: error.message });
                        throw error;
                    }
                },
                () => {
                    output.textContent = value === undefined ? "暂无缓存" : JSON.stringify(value, null, 2);
                    navigation.open("$caches");
                },
            );
        });
        handlers.set("clearCaches", async () => {
            if (saving) return;
            if (!(await requestConfirmation(window, `清空 ${active} 的全部 Caches？`)) || destroyed || saving) return;
            return perform(
                () => client.clearCaches(active),
                () => {
                    output.textContent = "暂无缓存";
                },
            );
        });
        handlers.set("reset", async () => {
            if (saving) return;
            if (!(await requestConfirmation(window, `重置 ${active}？这将删除该模块的 Settings、Caches 和其它持久化数据。`)) || destroyed || saving) return;
            return perform(() => client.reset(active), controls);
        });
        navigation?.destroy();
        navigation = new Navigation(viewport, view, key => editors.get(key)?.node);
        navigation.addEventListener("change", updateNavigation);
        for (const grow of growingInputs) grow();
        updateNavigation();
    }
    /**
     * 已加载的表单交由导航组件返回；加载阶段可以返回先前文档。
     * Loaded forms delegate back to navigation; loading views can return to the previous document.
     * @returns {void} 无返回值 / No return value.
     */
    back.onclick = () => {
        if (saving) return;
        if (navigation) navigation.back();
        else window.history.back();
    };
    open(catalog.module.module);
    return {
        /**
         * 移除监听器、定时器、会话和挂载内容。
         * Remove listeners, timers, session and mounted content.
         * @returns {void} 无返回值 / No return value.
         */
        destroy() {
            destroyed = true;
            menu.destroy();
            window.frameElement?.removeEventListener("preferencepanes:action", onAction);
            navigation?.destroy();
            generation++;
            if (active && !saving) client.leave(active);
            clearTimeout(timer);
            shell.remove();
        },
    };
}
