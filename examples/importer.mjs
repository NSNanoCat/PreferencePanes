const form = document.querySelector("#import");
const boxjs = document.querySelector("#boxjs");
const generate = document.querySelector("#generate");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const preview = document.querySelector("#preview");

boxjs.onchange = () => {
    generate.disabled = !boxjs.files.length;
};
// 点击生成才读取 BoxJS；预览在独立文档中运行通用前端。
// Read BoxJS only on Generate; the generic frontend runs in an isolated document.
form.onsubmit = async event => {
    event.preventDefault();
    generate.disabled = true;
    error.hidden = true;
    preview.hidden = true;
    preview.src = "about:blank";
    status.textContent = "生成中…";
    try {
        const input = JSON.parse(await boxjs.files[0].text());
        const response = await fetch("/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boxjs: input }) });
        const result = await response.json();
        if (response.status !== 200) throw new Error(result.error);
        preview.src = result.url;
        preview.hidden = false;
        status.textContent = `已生成：${result.module}`;
    } catch (cause) {
        status.textContent = "生成失败";
        error.textContent = cause.message;
        error.hidden = false;
    } finally {
        generate.disabled = !boxjs.files.length;
    }
};
