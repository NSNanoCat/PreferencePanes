const form = document.querySelector("#import");
const boxjs = document.querySelector("#boxjs");
const generate = document.querySelector("#generate");
const example = document.querySelector("#example");
const cssMode = document.querySelector("#css-mode");
const css = document.querySelector("#css");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const preview = document.querySelector("#preview");
let importedBoxJs;

boxjs.onchange = () => {
    generate.disabled = !boxjs.files.length;
};

/**
 * 读取当前 CSS 选择，内置样式不产生额外资源。
 * Read the current CSS selection; built-in styles produce no extra resource.
 * @returns {Promise<{cssMode: string, css?: string}>} CSS 预览输入 / CSS preview input.
 */
async function cssInput() {
    if (cssMode.value !== "import") return { cssMode: cssMode.value };
    if (!css.files.length) throw new TypeError("请选择要导入的 CSS 文件");
    return { cssMode: cssMode.value, css: await css.files[0].text() };
}

/**
 * 在独立 iframe 中加载内置或导入的 BoxJS 配置。
 * Load a built-in or imported BoxJS configuration in an isolated iframe.
 * @param {string} endpoint 预览接口 / Preview endpoint.
 * @param {RequestInit} options 请求参数 / Request options.
 * @param {string} pending 加载状态 / Loading status.
 * @param {(result: {module: string}) => string} complete 完成状态 / Completion status.
 * @returns {Promise<void>} 预览已更新 / Preview updated.
 */
async function loadPreview(endpoint, options, pending, complete) {
    generate.disabled = true;
    example.disabled = true;
    error.hidden = true;
    preview.hidden = true;
    preview.src = "about:blank";
    status.textContent = pending;
    try {
        const response = await fetch(endpoint, options);
        const result = await response.json();
        if (response.status !== 200) throw new Error(result.error);
        preview.src = result.url;
        preview.hidden = false;
        status.textContent = complete(result);
    } catch (cause) {
        status.textContent = "生成失败";
        error.textContent = cause.message;
        error.hidden = false;
    } finally {
        generate.disabled = !boxjs.files.length;
        example.disabled = false;
    }
}

/**
 * 使用当前 BoxJS 与 CSS 选择刷新预览。
 * Refresh the preview with the current BoxJS and CSS selection.
 * @returns {Promise<void>} 预览已更新 / Preview updated.
 */
async function refresh() {
    try {
        const style = await cssInput();
        const endpoint = importedBoxJs ? "/preview" : "/example";
        const body = importedBoxJs ? { boxjs: importedBoxJs, ...style } : style;
        const label = cssMode.options[cssMode.selectedIndex].textContent;
        await loadPreview(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, importedBoxJs ? "正在生成文件预览…" : "正在加载内置示例…", result =>
            importedBoxJs ? `已生成：${result.module}，${label}` : `内置示例：${result.module}，${label}，包含全部控件类型和历史值提示。`,
        );
    } catch (cause) {
        status.textContent = "生成失败";
        error.textContent = cause.message;
        error.hidden = false;
    }
}

example.onclick = () => {
    importedBoxJs = undefined;
    refresh();
};

cssMode.onchange = () => {
    css.disabled = cssMode.value !== "import";
    if (cssMode.value !== "import" || css.files.length) refresh();
    else {
        error.hidden = true;
        status.textContent = "请选择要导入的 CSS 文件";
    }
};

css.onchange = () => {
    if (css.files.length) refresh();
};

// 点击预览文件时才读取 BoxJS；内置示例不依赖本地文件选择。
// Read BoxJS only when previewing a file; the built-in example needs no local file selection.
form.onsubmit = async event => {
    event.preventDefault();
    try {
        importedBoxJs = JSON.parse(await boxjs.files[0].text());
        await refresh();
    } catch (cause) {
        status.textContent = "生成失败";
        error.textContent = cause.message;
        error.hidden = false;
    }
};

refresh();
