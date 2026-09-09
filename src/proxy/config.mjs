import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";

/**
 * 为没有原生远程 Mock 的代理返回 BoxJS JSON，不提供存储或页面处理。
 * Return BoxJS JSON on proxies without native remote Mock, without storage or page handling.
 * @param {unknown} config 构建时嵌入的 BoxJS JSON / BoxJS JSON embedded at build time.
 * @returns {void} 将响应交给宿主 / Deliver the response to the host.
 */
export function mockConfiguration(config) {
    const method = globalThis.$request.method;
    const allowed = method === "GET" || method === "HEAD";
    const response = {
        status: allowed ? 200 : 405,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Allow: "GET, HEAD" },
        body: method === "HEAD" ? "" : JSON.stringify(allowed ? config : { error: "Method not allowed" }),
    };
    done($app === "Quantumult X" ? response : { response });
}
