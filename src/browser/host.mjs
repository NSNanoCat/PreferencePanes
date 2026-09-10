import { BilibiliHost } from "./BilibiliHost.mjs";
import { ModuleFrame } from "./ModuleFrame.mjs";
import { ModuleStatus } from "./ModuleStatus.mjs";
import { Navigation } from "./Navigation.mjs";

const container = document.querySelector("[data-preference-panes-pages]");
const home = document.querySelector("[data-preference-panes-home]");
const template = document.querySelector("template[data-preference-panes-module]");
const buttons = [...home.querySelectorAll("[data-module][data-page][data-json]")];
let frame;

const native = new BilibiliHost(id => frame.perform(id));
const navigation = new Navigation(container, home, (module, signal) => {
    const button = buttons.find(button => button.dataset.module === module);
    if (!button) return;
    const host = template.content.firstElementChild.cloneNode(true);
    const message = host.querySelector("[data-module-message]");
    frame = new ModuleFrame(button.dataset.page, {
        signal,
        headers: {
            "X-PreferencePanes-JSON": button.dataset.json,
            ...(button.dataset.css ? { "X-PreferencePanes-CSS": button.dataset.css } : {}),
        },
    });
    frame.addEventListener("confirm", event => {
        event.preventDefault();
        native.confirm(event.detail.message).then(event.detail.resolve, event.detail.reject);
    });
    frame.addEventListener("notice", event => {
        event.preventDefault();
        native.notice(event.detail.message);
    });
    frame.addEventListener("change", updateNavigation);
    frame.element.onload = () => {
        message.hidden = true;
    };
    host.append(frame.element);
    frame.load().catch(error => {
        if (!signal.aborted) message.textContent = error.message;
    });
    return host;
});

const statuses = buttons.map(button => {
    const status = new ModuleStatus(button.querySelector("[data-module-status]"));
    status.addEventListener("change", () => {
        button.disabled = status.state.status !== "installed";
    });
    button.addEventListener("click", () => navigation.open(button.dataset.module));
    return { button, status };
});

/**
 * 同步当前页面的官方导航状态。
 * Synchronize the official navigation state for the current page.
 * @returns {void} 无返回值 / No return value.
 */
function updateNavigation() {
    const state = navigation.current ? frame.state : { title: document.title, actions: [], busy: false };
    native.update(state);
}

/**
 * 每次返回主页并发探测全部配置 Mock。
 * Probe all configuration Mocks concurrently whenever the home page is entered.
 * @returns {void} 无返回值 / No return value.
 */
function probe() {
    updateNavigation();
    if (navigation.current) return;
    for (const { button, status } of statuses) status.check(button.dataset.json);
}

navigation.addEventListener("change", probe);
window.addEventListener("pagehide", event => {
    if (!event.persisted) {
        for (const { status } of statuses) status.destroy();
        navigation.destroy();
        native.destroy();
    }
});
probe();
