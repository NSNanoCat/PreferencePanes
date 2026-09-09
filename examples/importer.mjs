const form = document.querySelector("#import");
const boxjs = document.querySelector("#boxjs");
const css = document.querySelector("#css");
const generate = document.querySelector("#generate");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const preview = document.querySelector("#preview");

boxjs.onchange = () => {
    generate.disabled = !boxjs.files.length;
};
document.querySelector("#clear-css").onclick = () => {
    css.value = "";
};

// 点击生成才读取两个文件；预览在独立文档中，CSS 不会影响导入表单。
// Read both files only on Generate; the isolated document keeps CSS away from the import form.
form.onsubmit = async event => {
    event.preventDefault();
    generate.disabled = true;
    error.hidden = true;
    preview.hidden = true;
    preview.src = "about:blank";
    status.textContent = "生成中…";
    try {
        const input = JSON.parse(await boxjs.files[0].text());
        const style = css.files[0] ? await css.files[0].text() : undefined;
        const response = await fetch("/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boxjs: input, css: style }) });
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
