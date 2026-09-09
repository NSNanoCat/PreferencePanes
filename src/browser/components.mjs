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
 * 用官方 b-style 组合行布局，不绑定某个 App 内置页面的编译作用域。
 * Compose rows with official b-style utilities without private app-page compilation scopes.
 * @template {"div" | "label"} T
 * @param {T} tag 行元素 / Row element.
 * @returns {HTMLElementTagNameMap[T]} 设置行 / Settings row.
 */
export function settingRow(tag) {
    return element(tag, "pp-row flex_between pd_md bb_1 bc_line_regular bg_bg1");
}

/**
 * 搜索、选择和文本控件共用官方输入配色与间距，交互由标准 HTML 控件负责。
 * Share official colors and spacing while native HTML controls own input interaction.
 * @param {HTMLElement} control 已创建的原生控件 / Existing native control.
 * @returns {HTMLElement} 输入控件 / Input control.
 */
export function fieldControl(control) {
    control.classList.add("pp-editor", "bg_bg3", "text1", "pd_sm", "bd_radius_md");
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
