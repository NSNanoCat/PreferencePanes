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
    // 官方 AppSettings 1.1.2 的作用域标记与原版 CSS 一起固定版本。
    // Pin official AppSettings 1.1.2 scope attributes together with its unmodified CSS.
    if (/\bform-row(?:\b|__)/.test(className)) node.setAttribute("data-v-b69aa1ea", "");
    if (/\bform-group(?:\b|__)/.test(className)) node.setAttribute("data-v-e590be47", "");
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * 搜索、选择和文本控件共用官方 VField 的 DOM 结构。
 * Share the official VField DOM structure across search, select and text controls.
 * @param {HTMLElement} control 已创建的原生控件 / Existing native control.
 * @param {boolean} [multiline] 是否为多行输入 / Whether the control is multiline.
 * @returns {HTMLDivElement} 字段容器 / Field container.
 */
export function fieldControl(control, multiline = false) {
    const field = element("div", `v-field pp-editor${multiline ? " v-field--textarea" : ""}`);
    const body = element("div", "v-field__body");
    control.classList.add("v-field__control");
    body.append(control);
    field.append(body);
    return field;
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
 * 展示标准 BoxJS 图标；icons 保持透明/彩色语义，不解释为亮暗版本。
 * Display standard BoxJS icons, preserving transparent/color rather than light/dark semantics.
 * @param {import("../index.js").BoxJSMetadata} metadata 展示信息 / Presentation metadata.
 * @param {string} className 样式 / CSS class.
 * @returns {HTMLImageElement | null} 图标或无图标 / Icon or no icon.
 */
export function icon(metadata, className) {
    const source = metadata.icon || metadata.icons?.[1] || metadata.icons?.[0];
    if (!source) return null;
    const image = element("img", className);
    image.src = resourceURL(source);
    image.alt = "";
    return image;
}

/**
 * 共享加载失败视图，不创建配置表单或数据读取。
 * Share a load-error view without creating controls or reading settings.
 * @param {Error} error 失败原因 / Failure reason.
 * @param {() => unknown} retry 重试动作 / Retry action.
 * @returns {HTMLElement} 错误视图 / Error view.
 */
export function errorView(error, retry) {
    const view = element("section", "pp-error");
    const button = element("button", "", "重新读取");
    button.type = "button";
    button.onclick = retry;
    view.append(element("p", "", `加载失败：${error.message}`), button);
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
