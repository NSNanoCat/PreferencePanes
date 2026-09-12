import { URL } from "@nsnanocat/url";
import assets from "#assets";
import { pageInputs } from "../lib/page-inputs.mjs";
import { response } from "../lib/response.mjs";
import { ModuleApi } from "../ModuleApi.mjs";
import { Store } from "../Store.mjs";
import { complete } from "./response.mjs";

/**
 * 通用代理入口：提供无鉴权 form 存储 API 及模块页面，不含业务配置。
 * Generic proxy entry serving unauthenticated form storage and module pages without business configuration.
 * @returns {Promise<void>} 已交给代理宿主的响应 / Response delivered to the proxy host.
 */
async function run() {
    const request = globalThis.$request;
    let result;
    try {
        const moduleAPI = new ModuleApi();
        const url = new URL(request.url);
        switch (true) {
            case url.pathname.startsWith("/api/module/"):
                result = await moduleAPI.handle(request, url);
                break;
            case url.pathname.startsWith("/api/"):
                result = await new Store().handle(request, url);
                break;
            case /^\/settings\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname): {
                const inputs = encodeURIComponent(JSON.stringify(pageInputs(url, request.headers)));
                result = response(request, 200, assets.page.body.replace("</head>", `<meta name="preference-panes-inputs" content="${inputs}"></head>`), "text/html");
                break;
            }
            default: {
                const asset = assets[url.pathname];
                if (asset) result = response(request, 200, asset.body, asset.type);
            }
        }
        if (result && !url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method)) result = response(request, 405, { error: "Method not allowed" });
    } catch (error) {
        console.error(`PreferencePanes: ${error.message}`);
        result = response(request, 500, { error: error.message });
    }
    complete(result);
}
run();
