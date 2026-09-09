import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";

/**
 * 统一适配代理的完成格式；未接管的请求原样继续。
 * Adapt the host completion format and pass through unhandled requests.
 * @param {import("../index.js").SettingsResponse | undefined} result 通用响应 / Common response.
 * @returns {void} 响应已交给宿主 / Response delivered to the host.
 */
export function complete(result) {
    done(!result ? {} : $app === "Quantumult X" ? result : { response: result });
}
