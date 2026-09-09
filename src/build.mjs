import { readFile } from "node:fs/promises";
import { BoxJS } from "./BoxJS.mjs";

/**
 * 从两个配置输入生成一个模块页及其读写与配置 Mock，不生成项目主页。
 * Build one module page, its storage script and config Mock without a project landing page.
 * @param {unknown} boxjs 仅包含一个模块的 BoxJS JSON / BoxJS JSON containing exactly one module.
 * @param {string} [css] 可选自定义 CSS 正文 / Optional custom CSS text.
 * @returns {Promise<Record<string, string>>} 相对路径到文件正文的映射 / Relative file paths mapped to file contents.
 */
export async function build(boxjs, css = "") {
    if (typeof css !== "string") throw new TypeError("CSS must be a string");
    const catalog = new BoxJS(boxjs);
    const module = catalog.module.module;
    const [html, app, proxy, mock] = await Promise.all([
        readFile(new URL("../dist/module/index.html", import.meta.url), "utf8"),
        readFile(new URL("../dist/module/app.mjs", import.meta.url), "utf8"),
        readFile(new URL("../dist/preference-panes.proxy.js", import.meta.url), "utf8"),
        readFile(new URL("../dist/preference-panes.config.js", import.meta.url), "utf8"),
    ]);
    const config = JSON.stringify(catalog.select(module));
    return {
        [`settings/${module}/index.html`]: html,
        [`settings/assets/${module}.html`]: html,
        "settings/assets/app.mjs": app,
        [`settings/assets/${module}.boxjs.json`]: config,
        [`settings/assets/${module}.css`]: css,
        [`settings/assets/${module}.request.js`]: `${proxy}\nPreferencePanes.run(${config},${JSON.stringify(css)});\n`,
        [`settings/assets/${module}.config.js`]: `${mock}\nPreferencePanes.mock(${config});\n`,
    };
}
