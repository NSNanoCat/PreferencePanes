import { errorView } from "./components.mjs";
import { mount } from "./index.mjs";

/**
 * 从包固定的两个输入资源启动应用，无菜单或安装映射配置。
 * Start from the package's two fixed input resources without menu or installation configuration.
 * @returns {Promise<void>} 启动完成 / Startup completion.
 */
async function start() {
    try {
        const [data, style] = await Promise.all([fetch("/settings/assets/boxjs.json", { cache: "no-store" }), fetch("/settings/assets/custom.css", { cache: "no-store" })]);
        if (data.status !== 200 || style.status !== 200) throw new Error(`HTTP ${data.status !== 200 ? data.status : style.status}`);
        mount(await data.json(), await style.text());
    } catch (error) {
        document.querySelector("#preferences").replaceChildren(errorView(error, start));
    }
}
start();
