import { BoxJS } from "../BoxJS.mjs";
import { pageInputs } from "../lib/page-inputs.mjs";
import { errorView } from "./components.mjs";
import { mount } from "./index.mjs";

let view;
/**
 * 从 URL 或代理传递的 Header 导入 JSON/CSS，支持独立文档与 srcdoc。
 * Import JSON/CSS from the URL or proxy-carried headers in standalone and srcdoc documents.
 * @returns {Promise<void>} 启动完成 / Startup completion.
 */
async function start() {
    try {
        view?.destroy();
        view = undefined;
        const context = document.querySelector('meta[name="preference-panes-inputs"]');
        const embedded = window.frameElement?.dataset.preferencePanes;
        let inputs;
        switch (true) {
            case embedded !== undefined:
                inputs = JSON.parse(embedded);
                document.documentElement.dataset.preferencePanesEmbedded = "";
                break;
            case context !== null:
                inputs = JSON.parse(decodeURIComponent(context.content));
                break;
            default:
                inputs = pageInputs(new URL(location.href));
        }
        const resources = [inputs.json, inputs.css].map(source => {
            if (!source) return null;
            const url = new URL(source, inputs.url);
            if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Resources must use HTTP(S) URLs");
            return url.href;
        });
        const [data, style] = await Promise.all(resources.map(url => (url ? fetch(url, { cache: "no-store", credentials: "omit" }) : null)));
        if (data.status !== 200 || (style && style.status !== 200)) throw new Error(`HTTP ${data.status !== 200 ? data.status : style.status}`);
        const catalog = new BoxJS(await data.json());
        if (catalog.module.module !== inputs.module) throw new Error("Imported JSON does not match the module URL");
        view = mount(catalog, style ? await style.text() : "");
    } catch (error) {
        document.querySelector("#preferences").replaceChildren(errorView(error, start));
    }
}
start();
window.addEventListener("pageshow", event => {
    if (event.persisted) start();
});
