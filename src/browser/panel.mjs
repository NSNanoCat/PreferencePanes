import { createPreferencesClient } from "./client.mjs";

/**
 * 挂载从 BoxJS 实时生成的设置面板和短暂通知。
 * Mount runtime-generated BoxJS controls and transient notifications.
 * @param {import("./index.js").PreferencesPanelOptions} options 容器与请求；页面路径 /settings/{module} 对应配置 / Container and requests; /settings/{module} selects config.
 * @returns {import("./index.js").PreferencesPanel} 面板生命周期句柄 / Panel lifecycle handle.
 */
export function mountPreferencePanes({ element: root, fetch, title = "Preferences" }) {
	const document = root.ownerDocument;
	const window = document.defaultView;
	/**
	 * 创建元素，文本统一通过 textContent 写入。
	 * Create an element and assign text only through textContent.
	 * @template {keyof HTMLElementTagNameMap} T
	 * @param {T} tag HTML 标签 / HTML tag.
	 * @param {string} className 样式类名 / CSS class name.
	 * @param {string} [text] 纯文本内容 / Plain-text content.
	 * @returns {HTMLElementTagNameMap[T]} 对应类型的元素 / Element of the corresponding type.
	 */
	const node = (tag, className, text) => {
		const el = document.createElement(tag);
		el.className = className;
		if (text !== undefined) el.textContent = text;
		return el;
	};
	const shell = node("div", "pp-panel");
	const header = node("header", "pp-header");
	const back = node("button", "pp-back", "返回");
	back.type = "button";
	const heading = node("h1", "pp-title", title);
	const viewport = node("div", "pp-viewport");
	const toast = node("div", "pp-toast");
	toast.setAttribute("role", "status");
	toast.hidden = true;
	header.append(back, heading);
	shell.append(header, viewport, toast);
	root.append(shell);
	let timer,
		routedPath,
		generation = 0,
		active = null,
		saving = false,
		pendingRoute = false,
		destroyed = false;
	/**
	 * 展示短暂通知，不刷新设置数据。
	 * Display a transient notification without refreshing settings.
	 * @param {{kind: "success" | "error", operation?: "write" | "delete" | "clearCaches" | "reset", message?: string}} event 操作结果 / Operation result.
	 * @returns {void} 无返回值 / No return value.
	 */
	const notify = event => {
		if (destroyed) return;
		switch (true) {
			case event.kind === "error":
				toast.textContent = `操作失败：${event.message}`;
				break;
			case event.operation === "delete":
				toast.textContent = "删除成功";
				break;
			case event.operation === "clearCaches":
				toast.textContent = "Caches 已清空";
				break;
			case event.operation === "reset":
				toast.textContent = "模块已重置";
				break;
			default:
				toast.textContent = "修改成功";
				break;
		}
		toast.dataset.kind = event.kind;
		toast.hidden = false;
		clearTimeout(timer);
		timer = setTimeout(() => {
			toast.hidden = true;
		}, 2400);
	};
	const client = createPreferencesClient({ fetch, notify });
	/**
	 * 切换加载或错误视图，按用户的动态效果偏好播放过渡。
	 * Replace a loading or error view, respecting reduced-motion preferences.
	 * @param {HTMLElement} view 新视图 / New view.
	 * @param {number} direction 过渡方向，正数从右侧进入 / Transition direction; positive enters from the right.
	 * @returns {void} 无返回值 / No return value.
	 */
	function replace(view, direction) {
		const old = viewport.firstElementChild;
		viewport.replaceChildren(view);
		if (old && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
			view.animate(
				[
					{ opacity: 0.4, transform: `translateX(${direction * 24}px)` },
					{ opacity: 1, transform: "translateX(0)" },
				],
				{ duration: 180, easing: "ease-out" },
			);
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
		replace(node("p", "pp-loading", "读取设置…"), 1);
		try {
			await client.open(module);
			if (version === generation) controls();
		} catch (error) {
			if (version !== generation) return;
			const view = node("section", "pp-error");
			view.append(node("p", "", `加载失败：${error.message}`));
			const retry = node("button", "", "重新读取");
			retry.onclick = () => open(module);
			view.append(retry);
			replace(view, 1);
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
		/** @type {Array<() => void>} 挂载后执行的多行高度更新 / Textarea sizing callbacks run after mounting. */
		const growingInputs = [];
		/**
		 * 写入期间统一切换控件禁用状态。
		 * Toggle all control disabled states during mutations.
		 * @param {boolean} disabled 是否禁用 / Whether controls are disabled.
		 * @returns {void} 无返回值 / No return value.
		 */
		const disableControls = disabled => {
			view.querySelectorAll("button,input,select,textarea").forEach(input => {
				input.disabled = disabled;
			});
		};
		/**
		 * 执行页面操作，期间锁定控件，完成后处理延后的导航。
		 * Run a page action with controls locked, then process deferred navigation.
		 * @param {() => Promise<void>} action 请求或写入 / Request or mutation.
		 * @param {() => void} success 成功后的局部更新 / Local update after success.
		 * @returns {Promise<void>} 操作完成 / Operation completion.
		 */
		async function perform(action, success) {
			if (saving) return;
			saving = true;
			back.disabled = true;
			disableControls(true);
			try {
				await action();
				if (!destroyed) success();
			} catch {
				/* 请求层已通知错误 / The request layer has already reported the error. */
			} finally {
				saving = false;
				back.disabled = window.history.length <= 1;
				disableControls(false);
				if (!destroyed && pendingRoute) route();
			}
		}
		const metadata = definition.metadata;
		if (metadata) {
			const info = node("div", "pp-module-info");
			const iconURL = metadata.icon || metadata.icons?.[1] || metadata.icons?.[0];
			/**
			 * 将元数据地址解析为可显示的 HTTP(S) URL。
			 * Resolve a metadata address into an HTTP(S) URL suitable for display.
			 * @param {string} value 绝对或相对地址 / Absolute or relative address.
			 * @returns {string} 完整地址 / Absolute URL.
			 * @throws {TypeError} 非 HTTP(S) 协议 / Non-HTTP(S) protocol.
			 */
			const resourceURL = value => {
				const url = new window.URL(value, window.location.href);
				if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Module metadata URLs must use HTTP or HTTPS");
				return url.href;
			};
			if (iconURL) {
				const image = node("img", "pp-module-icon");
				image.src = resourceURL(iconURL);
				image.alt = "";
				info.append(image);
			}
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
			const row = node("fieldset", "pp-field");
			row.append(node("legend", "", field.name));
			if (field.description) row.append(node("p", "pp-description", field.description));
			const value = values[field.key];
			/** @type {() => unknown} 读取尚未保存的输入 / Read the unsaved input. */
			let read;
			/** @type {(value: unknown) => void} 更新当前控件 / Update the current control. */
			let write;
			switch (true) {
				case Boolean(field.options) && field.type !== "array": {
					const select = node("select", "pp-input");
					select.setAttribute("aria-label", field.name);
					field.options.forEach((option, index) => {
						const item = node("option", "", option.label);
						item.value = String(index);
						select.append(item);
					});
					write = value => {
						select.selectedIndex = field.options.findIndex(option => option.key === value);
					};
					row.append(select);
					read = () => field.options[select.selectedIndex]?.key;
					break;
				}
				case field.type === "array" && Boolean(field.options): {
					const inputs = field.options.map(option => {
						const label = node("label", "pp-choice", option.label);
						const input = node("input", "");
						input.type = "checkbox";
						label.prepend(input);
						row.append(label);
						return { input, key: option.key };
					});
					read = () => inputs.filter(option => option.input.checked).map(option => option.key);
					write = value => {
						for (const option of inputs) option.input.checked = Array.isArray(value) && value.includes(option.key);
					};
					break;
				}
				default: {
					const multiline = field.control === "textarea" || field.type === "array";
					const input = node(multiline ? "textarea" : "input", "pp-input");
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
					if (field.type === "boolean") {
						input.type = "checkbox";
						write = value => {
							input.checked = value === true;
						};
						read = () => input.checked;
					} else {
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
					}
					row.append(input);
					break;
				}
			}
			write(value);
			const actions = node("div", "pp-actions");
			for (const [operation, label] of [
				["write", "保存"],
				["delete", "删除覆盖值"],
			]) {
				const button = node("button", "", label);
				button.type = "button";
				button.onclick = () =>
					perform(
						async () => {
							if (operation === "delete") await client.remove(active, field.key);
							else {
								let value;
								try {
									value = read();
								} catch (error) {
									notify({ kind: "error", message: error.message });
									throw error;
								}
								await client.set(active, field.key, value);
							}
						},
						() => write(client.snapshot(active).values[field.key]),
					);
				actions.append(button);
			}
			row.append(actions);
			view.append(row);
		}
		const maintenance = node("section", "pp-maintenance");
		maintenance.append(node("h2", "pp-title", "模块数据"));
		const actions = node("div", "pp-actions");
		const cacheView = node("button", "", "查看 Caches");
		const cacheClear = node("button", "", "清空 Caches");
		const reset = node("button", "pp-danger", "重置模块");
		const output = node("pre", "pp-cache");
		output.hidden = true;
		output.setAttribute("aria-label", "Caches 内容");
		for (const button of [cacheView, cacheClear, reset]) button.type = "button";
		cacheView.onclick = () => {
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
					output.hidden = false;
					cacheView.textContent = "刷新 Caches";
				},
			);
		};
		cacheClear.onclick = () => {
			if (!window.confirm(`清空 ${active} 的全部 Caches？`)) return;
			return perform(
				() => client.clearCaches(active),
				() => {
					output.textContent = "暂无缓存";
				},
			);
		};
		reset.onclick = () => {
			if (!window.confirm(`重置 ${active}？这将删除该模块的 Settings、Caches 和其它持久化数据。`)) return;
			return perform(() => client.reset(active), controls);
		};
		actions.append(cacheView, cacheClear, reset);
		maintenance.append(actions, output);
		view.append(maintenance);
		viewport.replaceChildren(view);
		for (const grow of growingInputs) grow();
	}
	/**
	 * 按页面 pathname 切换模块，写入尚未完成时延后导航。
	 * Route by the page pathname, deferring navigation while a mutation is pending.
	 * @returns {void} 无返回值 / No return value.
	 */
	function route() {
		if (saving) {
			pendingRoute = true;
			return;
		}
		pendingRoute = false;
		if (active) client.leave(active);
		routedPath = window.location.pathname;
		const match = /^\/settings\/([a-zA-Z0-9_-]+)\/?$/.exec(routedPath);
		if (!match) {
			generation++;
			active = null;
			heading.textContent = title;
			replace(node("p", "pp-error", "页面地址应为 /settings/模块标识。"), 1);
			return;
		}
		open(match[1]);
	}
	/**
	 * 仅在 pathname 改变时处理历史导航。
	 * Handle history navigation only when the pathname changes.
	 * @returns {void} 无返回值 / No return value.
	 */
	const onPopState = () => {
		if (window.location.pathname !== routedPath) route();
	};
	/**
	 * 从浏览器往返缓存恢复时重新读取当前模块。
	 * Reload the current module when restored from the browser back-forward cache.
	 * @param {PageTransitionEvent} event 页面恢复事件 / Page restoration event.
	 * @returns {void} 无返回值 / No return value.
	 */
	const onPageShow = event => {
		if (event.persisted) route();
	};
	back.onclick = () => {
		if (!saving) window.history.back();
	};
	window.addEventListener("popstate", onPopState);
	window.addEventListener("pageshow", onPageShow);
	route();
	return {
		/**
		 * 移除监听器、定时器、会话和挂载内容。
		 * Remove listeners, timers, session and mounted content.
		 * @returns {void} 无返回值 / No return value.
		 */
		destroy() {
			destroyed = true;
			window.removeEventListener("popstate", onPopState);
			window.removeEventListener("pageshow", onPageShow);
			generation++;
			if (active) client.leave(active);
			clearTimeout(timer);
			shell.remove();
		},
	};
}
