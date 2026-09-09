import { readFile } from "node:fs/promises";
import { BoxJS } from "./BoxJS.mjs";

/**
 * 从两个配置输入生成完整站点、通用代理脚本和各模块配置 Mock。
 * Build the complete site, shared proxy and module configuration Mocks from two configuration inputs.
 * @param {unknown} boxjs BoxJS JSON，字段数组、app 或订阅 / BoxJS JSON: field array, app or subscription.
 * @param {string} [css] 可选自定义 CSS 正文 / Optional custom CSS text.
 * @returns {Promise<Record<string, string>>} 相对路径到文件正文的映射 / Relative file paths mapped to file contents.
 */
export async function build(boxjs, css = "") {
    if (typeof css !== "string") throw new TypeError("CSS must be a string");
    const catalog = new BoxJS(boxjs);
    const [html, app, proxy, mock] = await Promise.all([
        readFile(new URL("../dist/settings/index.html", import.meta.url), "utf8"),
        readFile(new URL("../dist/settings/app.mjs", import.meta.url), "utf8"),
        readFile(new URL("../dist/preference-panes.proxy.js", import.meta.url), "utf8"),
        readFile(new URL("../dist/preference-panes.config.js", import.meta.url), "utf8"),
    ]);
    const files = {
        "settings/index.html": html,
        "settings/assets/index.html": html,
        "settings/assets/app.mjs": app,
        "settings/assets/boxjs.json": JSON.stringify(catalog.document),
        "settings/assets/custom.css": css,
        "settings/assets/PreferencePanes.request.js": `${proxy}\nPreferencePanes.run(${JSON.stringify(catalog.document)},${JSON.stringify(css)});\n`,
    };
    for (const module of catalog.modules.keys()) {
        const config = JSON.stringify(catalog.select(module));
        files[`settings/${module}/index.html`] = html;
        files[`settings/assets/${module}.boxjs.json`] = config;
        files[`settings/assets/${module}.config.js`] = `${mock}\nPreferencePanes.mock(${config});\n`;
    }
    return files;
}
