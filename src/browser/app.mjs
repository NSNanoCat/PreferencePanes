import { BoxJS } from "../BoxJS.mjs";
import { errorView } from "./components.mjs";
import { mount } from "./index.mjs";

let view;
/**
 * 在具体模块地址导入 JSON 与 CSS，再交给模块渲染器。
 * Import JSON and CSS at a concrete module URL and pass them to the module renderer.
 * @returns {Promise<void>} 启动完成 / Startup completion.
 */
async function start() {
    try {
        view?.destroy();
        view = undefined;
        const match = /^\/settings\/([a-zA-Z0-9_-]+)\/?$/.exec(location.pathname);
        if (!match) throw new Error("Open a concrete module URL");
        const module = match[1];
        const [data, style] = await Promise.all([fetch(`/configs/${module}`, { cache: "no-store" }), fetch(`/settings/assets/${module}.css`, { cache: "no-store" })]);
        if (data.status !== 200 || style.status !== 200) throw new Error(`HTTP ${data.status !== 200 ? data.status : style.status}`);
        const boxjs = await data.json();
        if (new BoxJS(boxjs).module.module !== module) throw new Error("Imported JSON does not match the module URL");
        view = mount(boxjs, await style.text());
    } catch (error) {
        document.querySelector("#preferences").replaceChildren(errorView(error, start));
    }
}
start();
window.addEventListener("pageshow", event => {
    if (event.persisted) start();
});
