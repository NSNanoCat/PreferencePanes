import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";
import { qs } from "@nsnanocat/util/polyfill/qs.mjs";
import { PreferencesHandler } from "../PreferencesHandler.mjs";

/**
 * 执行独立代理脚本；安装映射由托管站点生成，或由宿主参数提供。
 * Run a standalone proxy script with a site-generated installation mapping or host arguments.
 * @param {import("../index.js").PreferencesHandlerOptions} [options] 安装映射 / Installation mapping.
 * @returns {Promise<void>} 已交给宿主的响应 / Response delivered to the proxy host.
 */
export async function runPreferences(options) {
	let response;
	try {
		const config = options ?? qs.parse(globalThis.$argument);
		const handler = new PreferencesHandler({ ...config, resources: config.resources ?? [] });
		response = await handler.handle(globalThis.$request);
	} catch (error) {
		console.error(`PreferencePanes: ${error.message}`);
		response = {
			status: 500,
			headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
			body: globalThis.$request.method === "HEAD" ? "" : JSON.stringify({ error: "Settings execution failed" }),
		};
	}
	if (!response) {
		done({});
		return;
	}
	done($app === "Quantumult X" ? response : { response });
}
