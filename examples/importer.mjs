const form = document.querySelector("#import");
const boxjs = document.querySelector("#boxjs");
const generate = document.querySelector("#generate");
const example = document.querySelector("#example");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const preview = document.querySelector("#preview");

boxjs.onchange = () => {
    generate.disabled = !boxjs.files.length;
};

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

example.onclick = () => loadPreview("/example", { method: "POST" }, "正在加载内置示例…", result => `内置示例：${result.module}，包含全部控件类型和历史值提示。`);

// 点击预览文件时才读取 BoxJS；内置示例不依赖本地文件选择。
// Read BoxJS only when previewing a file; the built-in example needs no local file selection.
form.onsubmit = async event => {
    event.preventDefault();
    try {
        const input = JSON.parse(await boxjs.files[0].text());
        await loadPreview("/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boxjs: input }) }, "正在生成文件预览…", result => `已生成：${result.module}`);
    } catch (cause) {
        status.textContent = "生成失败";
        error.textContent = cause.message;
        error.hidden = false;
    }
};

example.click();
