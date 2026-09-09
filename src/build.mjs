import { readFile } from "node:fs/promises";
import { BoxJS } from "./BoxJS.mjs";

/**
 * 仅生成模块前端文件，不复制配置或生成绑定业务的读写脚本。
 * Build module frontend files without copying configuration or generating bound storage scripts.
 * @param {unknown} boxjs 仅包含一个模块的 BoxJS JSON / BoxJS JSON containing exactly one module.
 * @param {string} [css] 可选自定义 CSS 正文 / Optional custom CSS text.
 * @returns {Promise<Record<string, string>>} 相对路径到文件正文的映射 / Relative file paths mapped to file contents.
 */
export async function build(boxjs, css = "") {
    if (typeof css !== "string") throw new TypeError("CSS must be a string");
    const catalog = new BoxJS(boxjs);
    const module = catalog.module.module;
    const [html, app, navigation] = await Promise.all([readFile(new URL("../dist/module/index.html", import.meta.url), "utf8"), readFile(new URL("../dist/module/app.mjs", import.meta.url), "utf8"), readFile(new URL("../dist/module/navigation.mjs", import.meta.url), "utf8")]);
    return {
        [`settings/${module}/index.html`]: html,
        [`settings/assets/${module}.html`]: html,
        "settings/assets/app.mjs": app,
        "settings/assets/navigation.mjs": navigation,
        [`settings/assets/${module}.css`]: css,
    };
}
