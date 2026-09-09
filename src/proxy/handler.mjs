import { URL } from "@nsnanocat/url";
import assets from "#assets";
import { BoxJS } from "../BoxJS.mjs";
import { response } from "../lib/response.mjs";
import { Store } from "../Store.mjs";
import { complete } from "./response.mjs";

/**
 * 仅为导入的模块提供页面与存储服务，项目主页由调用方自行托管。
 * Serve only the imported module's page and persistence; callers host their own project landing pages.
 * @param {unknown} boxjs BoxJS JSON / BoxJS JSON.
 * @param {string} [css] 自定义 CSS 正文 / Custom CSS text.
 * @returns {Promise<void>} 已提交宿主响应 / Delivered host response.
 */
export async function run(boxjs, css = "") {
    const request = globalThis.$request;
    let result;
    try {
        if (typeof css !== "string") throw new TypeError("CSS must be a string");
        const catalog = new BoxJS(boxjs);
        const module = catalog.module.module;
        const url = new URL(request.url);
        switch (true) {
            case url.pathname.startsWith("/api/"):
                result = await new Store(catalog).handle(request, url);
                break;
            case url.pathname.startsWith("/configs/"):
                break;
            case url.pathname === `/settings/assets/${module}.css`:
                result = response(request, 200, css, "text/css");
                break;
            default: {
                const path = url.pathname === `/settings/${module}` || url.pathname === `/settings/${module}/` ? "page" : url.pathname;
                const asset = assets[path];
                if (asset) result = response(request, 200, asset.body, asset.type);
            }
        }
        if (result && !url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method)) result = response(request, 405, { error: "Method not allowed" });
    } catch (error) {
        console.error(`PreferencePanes: ${error.message}`);
        result = response(request, 500, { error: "Settings execution failed" });
    }
    complete(result);
}
