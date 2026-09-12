/**
 * 统一生成不可缓存的响应，HEAD 始终省略正文。
 * Create an uncached response, always omitting the body for HEAD.
 * @param {import("../index.js").SettingsRequest} request 宿主请求 / Host request.
 * @param {number} status HTTP 状态 / HTTP status.
 * @param {unknown} body JSON 数据或资源正文 / JSON data or resource body.
 * @param {string} [type] 媒体类型 / Media type.
 * @param {Record<string, string>} [extraHeaders={}] 额外响应头 / Additional response headers.
 * @returns {import("../index.js").SettingsResponse} 通用响应 / Common response.
 */
export function response(request, status, body, type = "application/json", extraHeaders = {}) {
    return {
        status,
        headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders },
        body: request.method === "HEAD" ? "" : type === "application/json" ? JSON.stringify(body) : body,
    };
}
