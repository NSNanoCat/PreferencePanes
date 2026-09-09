/**
 * 统一解析模块页的资源地址：Header 优先于查询参数，再使用模块约定。
 * Resolve module resource locations: headers override query parameters and module conventions.
 * @param {URL} url 已解析的页面请求地址 / Parsed page request URL.
 * @param {Record<string, string | undefined>} [headers] 请求头，名称不区分大小写 / Case-insensitive request headers.
 * @returns {{url: string, module: string, json: string, css: string}} 页面上下文与两个资源输入 / Page context and two resource inputs.
 */
export function pageInputs(url, headers = {}) {
    const match = /^\/settings\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname);
    if (!match) throw new TypeError("Open a concrete module URL");
    const module = match[1];
    const values = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    const json = values["x-preferencepanes-json"] ?? url.searchParams.get("json") ?? `/configs/${module}`;
    const css = values["x-preferencepanes-css"] ?? url.searchParams.get("css") ?? "";
    if (!json.trim()) throw new TypeError("JSON resource URL is required");
    return { url: url.href, module, json, css };
}
