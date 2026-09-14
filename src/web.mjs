import { URL } from "@nsnanocat/url";
import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";
import assets from "#assets";

/**
 * 按标准 URL 语义解析页面资源地址，并限制为 HTTP(S)。
 * Resolve a page resource reference with standard URL semantics and require HTTP(S).
 * @param {string} source 资源地址 / Resource reference.
 * @param {URL} base 模块页面地址 / Module page URL.
 * @param {string} kind 资源名称 / Resource name.
 * @returns {URL} 绝对资源地址 / Absolute resource URL.
 */
function resourceURL(source, base, kind) {
    if (!source) throw new TypeError(`${kind} resource URL is required`);
    const scheme = /^([a-zA-Z][a-zA-Z\d+.-]*:)/.exec(source)?.[1].toLowerCase();
    if (scheme && !["http:", "https:"].includes(scheme)) throw new TypeError(`${kind} resource must use HTTP(S)`);
    let resource;
    if (scheme) resource = new URL(source);
    else if (source.startsWith("//")) resource = new URL(`${base.protocol}${source}`);
    else {
        const [, path, query, hash] = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(source);
        const pathname = path.startsWith("/") ? path : `${base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1)}${path}`;
        const segments = [];
        for (const segment of pathname.split("/")) {
            if (segment === ".") continue;
            if (segment === "..") {
                if (segments.length > 1) segments.pop();
            } else segments.push(segment);
        }
        const normalized = segments.join("/") || "/";
        resource = new URL(`${base.origin}${normalized}${query ?? (path ? "" : base.search)}${hash ?? ""}`);
    }
    if (!["http:", "https:"].includes(resource.protocol.toLowerCase())) throw new TypeError(`${kind} resource must use HTTP(S)`);
    return resource;
}

/**
 * 转义写入 HTML 属性的资源地址。
 * Escape a resource URL for an HTML attribute.
 * @param {URL} resource 资源地址 / Resource URL.
 * @returns {string} HTML 属性值 / HTML attribute value.
 */
function attribute(resource) {
    return resource.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

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
                const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
                const module = url.pathname.split("/")[2];
                const jsonSource = (Object.hasOwn(headers, "x-preferencepanes-json") ? headers["x-preferencepanes-json"] : (url.searchParams.get("json") ?? `/api/${module}`))?.trim();
                const json = `<meta name="preference-panes-boxjs" content="${attribute(resourceURL(jsonSource, url, "BoxJS"))}">`;
                const cssSource = (Object.hasOwn(headers, "x-preferencepanes-css") ? headers["x-preferencepanes-css"] : url.searchParams.get("css"))?.trim();
                let stylesheet = "";
                if (cssSource) stylesheet = `<link data-preference-panes-stylesheet rel="stylesheet" href="${attribute(resourceURL(cssSource, url, "CSS"))}">`;
                result = response(request, 200, assets.page.body.replace("<!--__PREFERENCE_PANES_JSON__-->", json).replace("<!--__PREFERENCE_PANES_STYLESHEET__-->", stylesheet), "text/html");
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
