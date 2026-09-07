import { URL } from "@nsnanocat/url";
import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";
import { fetch } from "@nsnanocat/util/polyfill/fetch";
import { qs } from "@nsnanocat/util/polyfill/qs.mjs";
import { createSettingsHandler } from "../lib/settings-handler.mjs";

// JavaScriptCore does not provide the browser URL global.
// JavaScriptCore 不提供浏览器的 URL 全局对象。
globalThis.URL ??= URL;

(async () => {
  let response;
  try {
    const { origin, configURL } = qs.parse(globalThis.$argument);
    const source = new globalThis.URL(configURL);
    if (source.protocol !== "https:") throw new TypeError("configURL must use HTTPS");
    const handle = createSettingsHandler({
      origin,
      loadConfig: async () => {
        const response = await fetch({ url: source.href, method: "GET", headers: { "Cache-Control": "no-cache" }, timeout: 5000 });
        if (response.status !== 200) throw new Error(`BoxJS source HTTP ${response.status}`);
        return JSON.parse(response.body);
      },
    });
    response = await handle(globalThis.$request);
  } catch (error) {
    console.error(`PreferencePanes: ${error.message}`);
    response = {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      body: globalThis.$request.method === "HEAD" ? "" : JSON.stringify({ error: "Settings execution failed" }),
    };
  }
  done(response ? ($app === "Quantumult X" ? response : { response }) : {});
})();
