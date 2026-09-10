/**
 * 创建元素，所有展示文本通过 textContent 写入。
 * Create elements and assign display text through textContent only.
 * @template {keyof HTMLElementTagNameMap} T
 * @param {T} tag 元素标签 / Element tag.
 * @param {string} className 样式类名 / CSS class.
 * @param {string} [text] 纯文本 / Plain text.
 * @returns {HTMLElementTagNameMap[T]} 创建的元素 / Created element.
 */
export function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * 创建通用设置行；外部 CSS 可通过 pp 类名覆盖视觉样式。
 * Create a generic settings row whose appearance can be overridden through pp classes.
 * @template {"div" | "label"} T
 * @param {T} tag 行元素 / Row element.
 * @returns {HTMLElementTagNameMap[T]} 设置行 / Settings row.
 */
export function settingRow(tag) {
    return element(tag, "pp-row");
}

/**
 * 为标准 HTML 输入控件添加通用面板类名。
 * Add the generic panel class to a standard HTML input control.
 * @param {HTMLElement} control 已创建的原生控件 / Existing native control.
 * @returns {HTMLElement} 输入控件 / Input control.
 */
export function fieldControl(control) {
    control.classList.add("pp-editor");
    return control;
}

/**
 * 元数据地址只允许 HTTP(S) 和相对地址。
 * Allow only HTTP(S) and relative metadata addresses.
 * @param {string} value 元数据地址 / Metadata address.
 * @returns {string} 完整地址 / Absolute address.
 */
export function resourceURL(value) {
    const url = new URL(value, document.baseURI);
    if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Metadata URLs must use HTTP(S)");
    return url.href;
}

/**
 * 创建覆盖可用内容区的通用读取状态，失败时可附加重试动作。
 * Create a shared status view that fills the available content area and may include retry.
 * @param {string} message 状态文本 / Status message.
 * @param {(() => unknown) | undefined} [retry] 重试动作 / Retry action.
 * @returns {HTMLElement} 居中状态视图 / Centered status view.
 */
export function statusView(message, retry) {
    const view = element("section", "pp-status");
    view.setAttribute("role", "status");
    view.setAttribute("aria-live", "polite");
    const spinner = element("span", "pp-status-spinner");
    spinner.setAttribute("aria-hidden", "true");
    view.append(spinner, element("p", "pp-status-message", message));
    if (retry) {
        const button = element("button", "pp-status-action", "重新读取");
        button.type = "button";
        button.onclick = retry;
        view.append(button);
    }
    return view;
}

/**
 * 请求宿主确认；独立网页使用浏览器对话框。
 * Request confirmation from the host, using the browser dialog for standalone pages.
 * @param {Window} host 模块窗口 / Module window.
 * @param {string} message 确认内容 / Confirmation message.
 * @returns {Promise<boolean>} 用户是否确认 / Whether the user confirmed.
 */
export function requestConfirmation(host, message) {
    return new Promise((resolve, reject) => {
        const frame = host.frameElement;
        if (frame) {
            const event = new frame.ownerDocument.defaultView.CustomEvent("preferencepanes:confirm", { cancelable: true, detail: { message, resolve, reject } });
            if (!frame.dispatchEvent(event)) return;
        }
        resolve(host.confirm(message));
    });
}
