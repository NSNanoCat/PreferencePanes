import { URL } from "@nsnanocat/url";
import { fetch } from "@nsnanocat/util/polyfill/fetch";
import { SettingsHandler } from "./SettingsHandler.mjs";

/**
 * 统一处理存储 API 和无原生 Mock 平台的静态资源请求。
 * Handle storage APIs and static resources on hosts without native Mock support.
 */
export class PreferencesHandler extends SettingsHandler {
    #origin;
    #resources;
    /**
     * 根据安装 JSON 配置资源映射，不执行项目自定义代码。
     * Configure resource mappings from installation JSON without project-specific code.
     * @param {import("./index.js").PreferencesHandlerOptions} options 安装映射 / Installation mapping.
     */
    constructor(options) {
        super(options);
        this.#origin = new URL(options.origin).origin;
        this.#resources = options.resources.map(({ pattern, source, contentType }) => {
            const url = new URL(source);
            if (url.protocol !== "https:") throw new TypeError("Resource sources must use HTTPS");
            if (typeof contentType !== "string" || /[\r\n]/.test(contentType)) throw new TypeError("Invalid resource content type");
            return { pattern: new RegExp(pattern), source: url.href, contentType };
        });
    }
    /**
     * API 先交给存储桥接，只有资源路由才发出下载请求。
     * Dispatch APIs to storage first; only resource routes perform downloads.
     * @param {import("./index.js").SettingsRequest} request 宿主请求 / Host request.
     * @returns {Promise<import("./index.js").SettingsResponse | undefined>} 响应或非接管请求 / Response or unhandled request.
     */
    async handle(request) {
        const api = await super.handle(request);
        if (api) return api;
        const url = new URL(request.url);
        if (url.origin !== this.#origin) return;
        const resource = this.#resources.find(resource => resource.pattern.test(url.pathname));
        if (!resource) return;
        switch (request.method) {
            case "GET":
            case "HEAD": {
                const response = await fetch({ url: resource.source, method: "GET", headers: { "Cache-Control": "no-cache" }, timeout: 5000 });
                return { status: response.status, headers: { "Content-Type": `${resource.contentType}; charset=utf-8`, "Cache-Control": "no-store" }, body: request.method === "HEAD" ? "" : response.body };
            }
            default:
                return { status: 405, headers: { Allow: "HEAD, GET" }, body: "" };
        }
    }
}
