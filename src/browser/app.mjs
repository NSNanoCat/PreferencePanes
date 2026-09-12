import { pageInputs } from "../lib/page-inputs.mjs";
import { statusView } from "./components.mjs";
import { mount } from "./index.mjs";
import { installDefaultStyles } from "./styles.mjs";

installDefaultStyles(document);
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
        document.querySelector("#preferences").replaceChildren(statusView("读取设置…"));
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
        const apiURL = new URL(`/api/module/${encodeURIComponent(inputs.module)}`, inputs.url).href;
        const resources = [inputs.css].map(source => {
            if (!source) return null;
            const url = new URL(source, inputs.url);
            if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Resources must use HTTP(S) URLs");
            return url.href;
        });
        const [style, modelResponse] = await Promise.all([...resources.map(url => (url ? fetch(url, { cache: "no-store", credentials: "omit" }) : null)), fetch(apiURL, { cache: "no-store", credentials: "omit", headers: { Accept: "application/json", "X-PreferencePanes-JSON": inputs.json } })]);
        if ((style && style.status !== 200) || modelResponse.status !== 200) throw new Error(`HTTP ${modelResponse.status !== 200 ? modelResponse.status : style.status}`);
        view = mount(await modelResponse.json(), style ? await style.text() : "");
    } catch (error) {
        document.querySelector("#preferences").replaceChildren(statusView(`加载失败：${error.message}`, start));
    }
}
start();
window.addEventListener("pageshow", event => {
    if (event.persisted) start();
});
