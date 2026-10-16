import { validValue } from "./boxjs.mjs";
import { PreferencesClient } from "./client.mjs";
import { fieldControl, element as node, settingRow, statusView } from "./components.mjs";

/**
 * 将字段级存储诊断转换为简短提示。
 * Convert a field-level storage diagnostic into concise display text.
 * @param {import("./client.mjs").StoredValueWarning} warning 存储警告 / Storage warning.
 * @returns {string} 用户可见提示 / User-visible warning.
 */
function warningMessage(warning) {
    const values = warning.values
        .map(value => {
            if (typeof value === "string") return value;
            return JSON.stringify(value) ?? String(value);
        })
        .join("、");
    return warning.kind === "undefined-options" ? `当前配置未定义值：${values}` : `当前存储值格式不受支持：${values}`;
}

/**
 * 管理模块表单、操作队列和设置会话。
 * Manage the module form, operation queue and settings session.
 */
export class PreferencesPanel {
    #release;
    #view;
    #state;
    #perform;

    /**
     * 挂载 BoxJS 定义对应的模块表单。
     * Mount the module form described by a BoxJS definition.
     * @param {HTMLElement} root 包内挂载元素 / Internal mount element.
     * @param {import("../index.js").ModuleDefinition} definition 已规范化字段定义 / Normalized field definition.
     * @param {import("./page.mjs").PageController} page 内部页面控制器 / Internal page controller.
     */
    constructor(root, definition, page) {
        this.#release = this.#mount(root, definition, page);
    }

    /**
     * 建立面板 DOM、交互和会话，并返回其释放操作。
     * Build panel DOM, interactions, and session, then return its release operation.
     * @param {HTMLElement} root 包内挂载元素 / Internal mount element.
     * @param {import("../index.js").ModuleDefinition} definition 已规范化字段定义 / Normalized field definition.
     * @param {import("./page.mjs").PageController} page 内部页面控制器 / Internal page controller.
     * @returns {() => void} 释放操作 / Release operation.
     */
    #mount(root, definition, page) {
        const title = definition.metadata?.name ?? definition.module;
        const document = root.ownerDocument;
        const window = document.defaultView;
        const shell = node("div", "pp-panel");
        shell.dataset.module = definition.module;
        const handlers = new Map();
        const menuItems = [
            { id: "viewSettings", label: "查看设置" },
            { id: "viewCaches", label: "查看缓存" },
            { id: "clearCaches", label: "清空缓存", destructive: true },
            { id: "reset", label: "重置设置", destructive: true },
        ];
        const viewport = node("div", "pp-viewport");
        shell.append(viewport);
        root.append(shell);
        const editors = new Map();
        this.#view = key => {
            const editor = editors.get(key);
            editor?.load?.();
            return editor?.node ?? root;
        };
        this.#state = key => ({ title: editors.get(key)?.title ?? title, actions: handlers.size ? menuItems : [], busy: saving });
        this.#perform = id => {
            if (!saving && handlers.has(id)) runAction(id);
        };
        const publishNavigation = () => {
            if (!destroyed) page.update();
        };
        let generation = 0,
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
            switch (event.kind === "error" ? "error" : event.operation) {
                case "error":
                    message = `操作失败：${event.message}`;
                    break;
                case "delete":
                    message = "删除成功";
                    break;
                case "clearCaches":
                    message = "Caches 已清空";
                    break;
                case "reset":
                    message = "设置已重置";
                    break;
                default:
                    message = "修改成功";
                    break;
            }
            page.notice({ kind: event.kind, message });
        };
        const client = new PreferencesClient({ definition, notify });
        /**
         * 菜单操作统一处理异步错误，包含宿主确认框错误。
         * Handle asynchronous action errors, including host-dialog errors.
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
            publishNavigation();
            viewport.replaceChildren(statusView("读取设置…"));
            try {
                await client.open();
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
            const { definition, values } = client.snapshot();
            const view = node("section", "pp-fields");
            /**
             * 挂载后执行的多行高度更新
             * Textarea sizing callbacks run after mounting.
             * @type {Array<() => void>}
             */
            const growingInputs = [];
            editors.clear();
            const summaries = [];
            const warningRefreshers = [];
            const groups = new Map();
            let queue = Promise.resolve(),
                pendingWrites = 0;
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
                publishNavigation();
                queue = queue
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
                        publishNavigation();
                    });
                return queue;
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
                const warning = node("span", "pp-field-warning");
                const refreshWarning = () => {
                    const issue = client.snapshot().warnings[field.key];
                    warning.hidden = !issue;
                    warning.textContent = issue ? warningMessage(issue) : "";
                };
                warningRefreshers.push(refreshWarning);
                refreshWarning();
                label.append(warning);
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
                switch (field.control === "url" ? "url" : field.options ? (field.type === "array" ? "checkboxes" : "selects") : field.type) {
                    case "url": {
                        const link = node("a", "pp-choice-link", "打开");
                        link.setAttribute("aria-label", field.name);
                        link.rel = "noopener noreferrer";
                        write = value => {
                            link.href = value;
                        };
                        link.addEventListener("click", event => {
                            event.preventDefault();
                            page.openURL(link.href);
                        });
                        row.append(link);
                        row.addEventListener("click", event => {
                            if (!link.contains(event.target)) link.click();
                        });
                        break;
                    }
                    case "selects": {
                        const select = node("select", "");
                        select.setAttribute("aria-label", field.name);
                        field.options.forEach((option, index) => {
                            const item = node("option", "", option.key === field.defaultValue ? `${option.label}（默认）` : option.label);
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
                    case "checkboxes": {
                        const editor = node("section", "pp-panel pp-detail pp-choice-page");
                        if (field.description) editor.append(node("p", "pp-description", field.description));
                        const choices = node("div", "pp-rows");
                        editor.append(choices);
                        inputContainer = choices;
                        editors.set(field.key, { node: editor, title: match?.[2] ?? field.name });
                        const summary = node("span", "pp-summary");
                        const link = node("button", "pp-choice-link");
                        link.type = "button";
                        link.setAttribute("aria-label", field.name);
                        link.append(summary, node("span", "pp-chevron", "›"));
                        row.append(link);
                        const refresh = () => {
                            const value = client.snapshot().values[field.key];
                            summary.textContent =
                                field.options
                                    .filter(option => Array.isArray(value) && value.includes(option.key))
                                    .map(option => option.label)
                                    .join("、") || "未选择";
                        };
                        summaries.push(refresh);
                        refresh();
                        link.onclick = () => page.open(field.key);
                        row.addEventListener("click", event => {
                            if (!link.contains(event.target)) link.click();
                        });
                        const inputs = field.options.map(option => {
                            const label = settingRow("label");
                            label.classList.add("pp-choice");
                            const name = node("span", "pp-choice-name", option.label);
                            if (field.defaultValue?.includes(option.key)) name.append(node("span", "pp-default-badge", "默认"));
                            label.append(name);
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
                    case "boolean": {
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
                        if (!multiline) {
                            input.type = field.type === "number" ? "number" : "text";
                            input.autocapitalize = "off";
                            input.setAttribute("autocorrect", "off");
                            input.spellcheck = false;
                        }
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
                        if (version === inputVersion) write(client.snapshot().values[field.key]);
                    };
                    perform(
                        () => {
                            if (!validValue(field, value)) {
                                const error = new TypeError("Invalid setting value");
                                notify({ kind: "error", operation: "write", module, key: field.key, message: error.message });
                                throw error;
                            }
                            return client.set(field.key, value);
                        },
                        () => {
                            for (const refresh of summaries) refresh();
                            for (const refresh of warningRefreshers) refresh();
                        },
                        restore,
                    );
                });
                if (eventName === "input") inputContainer.addEventListener("compositionend", event => event.target.dispatchEvent(new window.Event("input", { bubbles: true })));
                groups.get(group).append(row);
            }
            const settingsPage = node("section", "pp-panel pp-detail pp-settings-page");
            const settingsOutput = node("pre", "pp-cache");
            settingsOutput.setAttribute("aria-label", "Settings 内容");
            settingsPage.append(settingsOutput);
            const loadSettings = () => {
                editors.get("$settings").load = undefined;
                if (saving) return;
                let value;
                return perform(
                    async () => {
                        try {
                            value = await client.readSettings();
                        } catch (error) {
                            notify({ kind: "error", message: error.message });
                            throw error;
                        }
                    },
                    () => {
                        settingsOutput.textContent = value === undefined ? "暂无设置" : JSON.stringify(value, null, 2);
                    },
                    () => {
                        settingsOutput.textContent = "读取设置失败";
                    },
                );
            };
            editors.set("$settings", { node: settingsPage, title: "设置", load: loadSettings });
            handlers.set("viewSettings", () => {
                loadSettings();
                page.open("$settings");
            });
            const cachePage = node("section", "pp-panel pp-detail pp-cache-page");
            const output = node("pre", "pp-cache");
            output.textContent = "正在读取缓存…";
            output.setAttribute("aria-label", "Caches 内容");
            cachePage.append(output);
            const loadCaches = () => {
                editors.get("$caches").load = undefined;
                if (saving) return;
                let value;
                return perform(
                    async () => {
                        try {
                            value = await client.readCaches();
                        } catch (error) {
                            notify({ kind: "error", message: error.message });
                            throw error;
                        }
                    },
                    () => {
                        output.textContent = value === undefined ? "暂无缓存" : JSON.stringify(value, null, 2);
                    },
                    () => {
                        output.textContent = "读取缓存失败";
                    },
                );
            };
            editors.set("$caches", { node: cachePage, title: "缓存", load: loadCaches });
            handlers.set("viewCaches", () => {
                loadCaches();
                page.open("$caches");
            });
            handlers.set("clearCaches", async () => {
                if (saving) return;
                const shared = definition.cachePath && definition.cachePath !== `@${definition.storageKey}.${active}.Caches`;
                const message = shared ? `清空共享缓存 ${definition.cachePath}？使用该缓存的其它模块也会受影响。` : `清空 ${active} 的全部 Caches？`;
                if (!(await page.confirm(message)) || destroyed || saving) return;
                return perform(
                    () => client.clearCaches(),
                    () => {
                        output.textContent = "暂无缓存";
                    },
                );
            });
            handlers.set("reset", async () => {
                if (saving) return;
                const message = definition.resetPaths ? `重置 ${definition.metadata?.name ?? active} 的设置？只删除本页面的设置，保留共享存储中的其它设置和缓存。` : `重置 ${active} 的设置？这将删除该模块的 Settings、Caches 和其它持久化数据。`;
                if (!(await page.confirm(message)) || destroyed || saving) return;
                return perform(() => client.reset(), controls);
            });
            viewport.replaceChildren(view);
            for (const grow of growingInputs) grow();
            page.refresh();
        }
        queueMicrotask(() => {
            if (!destroyed) open(definition.module);
        });
        return () => {
            destroyed = true;
            generation++;
            client.leave();
            shell.remove();
        };
    }

    /**
     * 返回当前会话中的字段或操作页，不再读取配置。
     * Return a field or action view from the current session without fetching configuration.
     * @param {string} key 子页键 / Detail key.
     * @returns {HTMLElement} 当前视图 / Current view.
     */
    view(key) {
        return this.#view(key);
    }

    /**
     * 提供当前页标题及菜单状态。
     * Provide the current title and action state.
     * @param {string} key 子页键 / Detail key.
     * @returns {object} 页面状态 / Page state.
     */
    state(key) {
        return this.#state(key);
    }

    /**
     * 执行共用菜单中的操作。
     * Perform an action from the shared menu.
     * @param {string} id 操作标识 / Action identifier.
     * @returns {void} 无返回值 / No return value.
     */
    perform(id) {
        this.#perform(id);
    }

    /**
     * 释放读取与视图；已开始的写入仍沿原队列完成。
     * Release reads and views while allowing started writes to finish through the existing queue.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#release();
    }
}
