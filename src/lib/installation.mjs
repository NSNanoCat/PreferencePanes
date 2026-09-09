import { validatePathParts } from "./settings-path.mjs";

/**
 * 按当前页面或请求地址生成安装文件，不引入额外来源配置。
 * Generate installation files from the current page or request URL without extra origin configuration.
 * @param {string} platform 代理工具 / Proxy tool.
 * @param {{origin:string, hostname:string}} url 运行时 URL / Runtime URL.
 * @param {string} [module] 配置 Mock 的模块；省略时生成通用模块 / Config Mock module; omit for the common module.
 * @returns {{extension:string, text:string}} 下载类型和正文 / Download extension and content.
 */
export function installation(platform, url, module) {
    if (module !== undefined) validatePathParts([module]);
    const origin = url.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("/", "\\/");
    const assets = `${url.origin}/settings/assets`;
    const page = `${origin}\\/settings\\/(?:[a-zA-Z0-9_-]+\\/?)?`;
    const resources = `${origin}\\/settings\\/assets\\/(?:app\\.mjs|boxjs\\.json|custom\\.css)`;
    const api = `${origin}\\/api\\/[^?]*`;
    const config = `${origin}\\/configs\\/${module}`;
    const pattern = `^(?:${module === undefined ? `${api}|${page}|${resources}` : config})(?:\\?.*)?$`;
    const apiPattern = `^(?:${api}|${resources})(?:\\?.*)?$`;
    const source = `${assets}/${module === undefined ? "PreferencePanes.request.js" : `${module}.config.js`}`;
    const name = `${url.hostname}.${module === undefined ? "PreferencePanes" : `${module}.Config`}`;
    const header = `#!name = ${name}\n#!openUrl = ${url.origin}/settings/\n`;
    switch (platform) {
        case "surge":
        case "loon": {
            const nativePattern = module === undefined ? `^${page}(?:\\?.*)?$` : pattern;
            const nativeSource = `${assets}/${module === undefined ? "index.html" : `${module}.boxjs.json`}`;
            if (platform === "surge")
                return {
                    extension: "sgmodule",
                    text: `${header}\n[Map Local]\n${nativePattern} data-type=file data="${nativeSource}" status-code=200 header="Content-Type:${module === undefined ? "text/html" : "application/json"}; charset=utf-8|Cache-Control:no-store"\n${module === undefined ? `\n[Script]\n${name} = type=http-request, pattern=${apiPattern}, requires-body=1, max-size=65536, script-path=${source}\n` : ""}\n[MITM]\nhostname = %APPEND% ${url.hostname}\n`,
                };
            return {
                extension: "plugin",
                text: `${header}\n[Rewrite]\n${nativePattern} mock-response-body data-type=${module === undefined ? "html" : "text"} data-path=${nativeSource} status-code=200\n${module === undefined ? `\n[Script]\nhttp-request ${apiPattern} requires-body=1, script-path=${source}, tag=${name}\n` : ""}\n[MitM]\nhostname = ${url.hostname}\n`,
            };
        }
        case "quantumult":
            return { extension: "snippet", text: `${header}\n#[rewrite_local]\n${pattern} url script-echo-response ${source}\n\n#[mitm]\nhostname = ${url.hostname}\n` };
        case "stash":
            return { extension: "stoverride", text: `name: ${name}\nhttp:\n  mitm:\n    - ${url.hostname}\n  script:\n    - match: ${pattern}\n      name: ${name}\n      type: request\n      require-body: ${module === undefined}\nscript-providers:\n  ${name}:\n    url: ${source}\n    interval: 86400\n` };
        case "shadowrocket":
            return { extension: "conf", text: `${header}\n[Script]\n${name} = type=http-request, pattern=${pattern}, ${module === undefined ? "requires-body=1, max-size=65536, " : ""}script-path=${source}\n\n[MITM]\nhostname = %APPEND% ${url.hostname}\n` };
        default:
            throw new TypeError("Unknown proxy platform");
    }
}
