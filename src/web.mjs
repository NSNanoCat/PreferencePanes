import { URL } from "@nsnanocat/url";
import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";
import assets from "#assets";
import { pageInputs } from "./lib/page-inputs.mjs";

/**
 * 返回模块页面及其公共浏览器资源，不处理 API、网络或持久化。
 * Serve module pages and common browser assets without handling APIs, network access or persistence.
 * @returns {void} 响应已交给代理宿主 / Response delivered to the proxy host.
 */
function run() {
    const request = globalThis.$request;
    let result;
    try {
        const url = new URL(request.url);
        if (/^\/settings\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) {
            if (!["GET", "HEAD"].includes(request.method)) result = response(request, 405, { error: "Method not allowed" });
            else {
                const inputs = encodeURIComponent(JSON.stringify(pageInputs(url, request.headers)));
                result = response(request, 200, assets.page.body.replace("</head>", `<meta name="preference-panes-inputs" content="${inputs}"></head>`), "text/html");
            }
        } else {
            const asset = assets[url.pathname];
            if (asset) result = ["GET", "HEAD"].includes(request.method) ? response(request, 200, asset.body, asset.type) : response(request, 405, { error: "Method not allowed" });
        }
    } catch (error) {
        console.error(`PreferencePanes Web: ${error.message}`);
        result = response(request, 500, { error: error.message });
    }
    if (!result) done({});
    else done($app === "Quantumult X" ? result : { response: result });
}

/**
 * 构造静态资源响应，HEAD 请求不返回正文。
 * Build a static resource response without a body for HEAD requests.
 * @param {import("./index.js").SettingsRequest} request 代理请求 / Proxy request.
 * @param {number} status HTTP 状态 / HTTP status.
 * @param {unknown} body 响应正文 / Response body.
 * @param {string} [type] 媒体类型 / Media type.
 * @returns {import("./index.js").SettingsResponse} 静态资源响应 / Static resource response.
 */
function response(request, status, body, type = "application/json") {
    return {
        status,
        headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        body: request.method === "HEAD" ? "" : type === "application/json" ? JSON.stringify(body) : body,
    };
}

run();
