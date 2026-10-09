import { ActionMenu, ModuleFrame, ModuleStatus, Navigation } from "./Navigation.mjs";
import { installDefaultStyles } from "./styles.mjs";

/**
 * 校验外部 JSON 中的章节、入口和导航目标，避免生成不可访问的设置入口。
 * Validate sections, entries and navigation targets in external JSON before rendering inaccessible entries.
 * @param {unknown} config 外部首页配置 / External homepage configuration.
 * @returns {void} 非法输入抛出错误 / Invalid input throws.
 */
function validateHome(config) {
    if (!config || typeof config.title !== "string" || !Array.isArray(config.sections)) throw new Error("首页 JSON 缺少 title 或 sections");
    if (config.logo !== undefined && typeof config.logo !== "string") throw new Error("首页 logo 必须是图片地址");
    if (config.footer !== undefined && (!Array.isArray(config.footer) || config.footer.some(text => typeof text !== "string"))) throw new Error("首页 footer 必须是文字数组");
    const modules = new Set();
    for (const section of config.sections) {
        if (!section || typeof section.title !== "string" || !Array.isArray(section.items) || (section.layout !== undefined && !["grid", "list"].includes(section.layout))) throw new Error("首页章节需要 title、items 和有效的 layout");
        for (const item of section.items) {
            if (!item || typeof item.name !== "string" || !item.icon || (typeof item.icon.src === "string") === (typeof item.icon.text === "string") || (item.icon.src !== undefined && typeof item.icon.src !== "string") || (item.icon.text !== undefined && typeof item.icon.text !== "string"))
                throw new Error("首页入口需要 name 和唯一的图片或文字 icon");
            if (item.description !== undefined && typeof item.description !== "string") throw new Error(`入口 ${item.name} 的 description 必须是文字`);
            if (item.target !== undefined && (item.module !== undefined || !["internal", "_self", "_blank"].includes(item.target))) throw new Error(`入口 ${item.name} 的 target 只允许链接使用 internal、_self 或 _blank`);
            if ((typeof item.module === "string") === (typeof item.href === "string") || (item.module !== undefined && typeof item.module !== "string") || (item.href !== undefined && typeof item.href !== "string")) throw new Error(`入口 ${item.name} 必须选择 module 或 href`);
            if (item.module !== undefined) {
                if (!/^[A-Za-z0-9_-]+$/.test(item.module) || (item.pageModule !== undefined && (typeof item.pageModule !== "string" || !/^[A-Za-z0-9_-]+$/.test(item.pageModule))) || modules.has(item.module)) throw new Error(`入口 ${item.name} 的模块名称无效或重复`);
                modules.add(item.module);
            } else {
                const protocol = new URL(item.href, "https://preference-panes.invalid/").protocol;
                if (item.pageModule !== undefined || ["javascript:", "data:", "vbscript:"].includes(protocol) || (item.target === "internal" && !["http:", "https:"].includes(protocol))) throw new Error(`入口 ${item.name} 的链接无效`);
            }
        }
    }
}

/**
 * 共用网格和列表章节；资源地址相对于 JSON，所有项目文字通过 textContent 绘制。
 * Share grid and list sections, resolve resources against JSON and render project text through textContent.
 * @param {import("./home.mjs").HomeConfig} config 已校验的首页配置 / Validated homepage configuration.
 * @param {URL} url JSON 地址 / JSON URL.
 * @param {HTMLElement} home 首页容器 / Homepage container.
 * @returns {void} 无返回值 / No return value.
 */
function renderHome(config, url, home) {
    const document = home.ownerDocument;
    home.replaceChildren();
    if (config.logo) {
        const logo = document.createElement("img");
        logo.className = "pp-home-logo";
        logo.src = new URL(config.logo, url).href;
        logo.alt = config.title;
        home.append(logo);
    }
    for (const section of config.sections) {
        const group = document.createElement("section");
        group.className = "pp-group";
        const title = document.createElement("h2");
        title.className = "pp-group-title";
        title.textContent = section.title;
        const entries = document.createElement("div");
        entries.className = "pp-home-entries";
        entries.dataset.layout = section.layout ?? "grid";
        for (const item of section.items) {
            const entry = document.createElement(item.module ? "button" : "a");
            entry.className = "pp-home-item";
            if (item.module) {
                entry.type = "button";
                entry.disabled = true;
                entry.dataset.module = item.module;
                if (item.pageModule) entry.dataset.preferencePanesModule = item.pageModule;
            } else {
                entry.href = new URL(item.href, url).href;
                if (item.target !== undefined) {
                    entry.dataset.target = item.target;
                    switch (item.target) {
                        case "_blank":
                            entry.target = item.target;
                            entry.rel = "noopener noreferrer";
                            break;
                        case "_self":
                            entry.target = item.target;
                            break;
                    }
                }
            }
            const icon = document.createElement("span");
            icon.className = "pp-home-icon";
            icon.setAttribute("aria-hidden", "true");
            if (item.icon.src !== undefined) {
                const image = document.createElement("img");
                image.src = new URL(item.icon.src, url).href;
                image.alt = "";
                icon.append(image);
            } else icon.textContent = item.icon.text;
            const content = document.createElement("span");
            content.className = "pp-home-content";
            const name = document.createElement("span");
            name.className = "pp-home-name";
            name.textContent = item.name;
            content.append(name);
            if (item.description !== undefined) {
                const description = document.createElement("span");
                description.className = "pp-description";
                description.textContent = item.description;
                content.append(description);
            }
            if (item.module) {
                const status = document.createElement("span");
                status.className = "pp-description";
                status.dataset.moduleStatus = "";
                status.textContent = "检测中";
                content.append(status);
            }
            entry.append(icon, content);
            if (entries.dataset.layout === "list") {
                const arrow = document.createElement("span");
                arrow.className = "pp-home-arrow";
                arrow.textContent = "›";
                arrow.setAttribute("aria-hidden", "true");
                entry.append(arrow);
            }
            entries.append(entry);
        }
        group.append(title, entries);
        home.append(group);
    }
    const footer = document.createElement("footer");
    footer.className = "pp-home-footer pp-description";
    for (const text of config.footer ?? []) {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        footer.append(paragraph);
    }
    home.append(footer);
}

/**
 * 浏览器宿主提供网页导航、通知、主题和可视区域避让。
 * The browser host provides web navigation, notices, theme and viewport clearance.
 * @param {import("./home.mjs").BridgeOptions} options 菜单和返回动作 / Menu and back action.
 * @returns {import("./home.mjs").Bridge} 浏览器宿主 / Browser host.
 */
function browserHost({ menu, back }) {
    const root = document.documentElement;
    const header = document.createElement("header");
    header.className = "pp-host-header";
    const button = document.createElement("button");
    button.className = "pp-host-back";
    button.type = "button";
    button.textContent = "‹";
    button.setAttribute("aria-label", "返回");
    button.onclick = back;
    const title = document.createElement("span");
    title.className = "pp-host-title";
    header.append(button, title, menu.element);
    document.body.prepend(header);
    const toast = document.createElement("div");
    toast.className = "pp-host-toast";
    toast.setAttribute("role", "status");
    toast.hidden = true;
    document.body.append(toast);
    let timer;
    const theme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
        root.dataset.theme = theme.matches ? "dark" : "light";
    };
    const viewport = window.visualViewport;
    const resize = () => {
        root.style.setProperty("--pp-host-height", `${header.getBoundingClientRect().height}px`);
        const clearance = viewport && viewport.scale === 1 ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
        root.style.setProperty("--pp-keyboard-height", `${clearance}px`);
    };
    theme.addEventListener("change", applyTheme);
    window.addEventListener("resize", resize);
    window.addEventListener("pageshow", resize);
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    applyTheme();
    resize();
    return {
        update(state) {
            title.textContent = state.title;
            button.hidden = !state.canGoBack;
            menu.element.hidden = !state.actions.length;
        },
        confirm: message => window.confirm(message),
        notice(detail) {
            clearTimeout(timer);
            toast.textContent = detail.message;
            toast.hidden = false;
            timer = setTimeout(() => {
                toast.hidden = true;
            }, 2400);
        },
        openURL(url, target) {
            switch (target) {
                case "_blank":
                    window.open(url, "_blank", "noopener,noreferrer");
                    break;
                default:
                    window.location.assign(url);
                    break;
            }
        },
        destroy() {
            clearTimeout(timer);
            theme.removeEventListener("change", applyTheme);
            window.removeEventListener("resize", resize);
            window.removeEventListener("pageshow", resize);
            viewport?.removeEventListener("resize", resize);
            viewport?.removeEventListener("scroll", resize);
            root.style.removeProperty("--pp-host-height");
            root.style.removeProperty("--pp-keyboard-height");
            delete root.dataset.theme;
            header.remove();
            toast.remove();
        },
    };
}

/**
 * 读取固定相对路径的首页 JSON 与可选 CSS、Bridge，初始化后共用模块探测与导航。
 * Load homepage JSON and optional CSS and Bridge at fixed relative paths, then share module probes and navigation.
 * @returns {Promise<() => void>} 退出清理动作；加载失败会显示错误并拒绝 / Cleanup action; load failures display an error and reject.
 */
export async function startHome() {
    let host;
    let menu;
    let navigation;
    let frame;
    let linkTitle;
    let statuses = [];
    let destroyed = false;
    let defaults;
    let stylesheet;
    const controller = new AbortController();
    const destroy = () => {
        if (destroyed) return;
        destroyed = true;
        controller.abort();
        for (const { status } of statuses) status.destroy();
        navigation?.destroy();
        host?.destroy();
        menu?.destroy();
        stylesheet?.remove();
        if (defaults?.owned) defaults.element.remove();
        window.removeEventListener("pagehide", pagehide);
    };
    const pagehide = event => {
        if (!event.persisted) destroy();
    };
    window.addEventListener("pagehide", pagehide);
    try {
        defaults = installDefaultStyles(document);
        const jsonURL = new URL("./home.json", document.baseURI);
        const response = await fetch(jsonURL, { signal: controller.signal });
        if (!response.ok) throw new Error(`首页 JSON 加载失败：HTTP ${response.status}`);
        const config = await response.json();
        validateHome(config);
        if (destroyed) return destroy;
        const cssURL = new URL("./theme.css", document.baseURI);
        const cssResponse = await fetch(cssURL, { method: "HEAD", cache: "no-store", signal: controller.signal });
        if (destroyed) return destroy;
        switch (cssResponse.status) {
            case 200:
                stylesheet = document.createElement("link");
                stylesheet.rel = "stylesheet";
                stylesheet.dataset.preferencePanesStylesheet = "";
                stylesheet.href = cssURL.href;
                await new Promise((resolve, reject) => {
                    const abort = () => reject(new DOMException("页面已退出", "AbortError"));
                    controller.signal.addEventListener("abort", abort, { once: true });
                    stylesheet.onload = () => {
                        controller.signal.removeEventListener("abort", abort);
                        resolve();
                    };
                    stylesheet.onerror = () => {
                        controller.signal.removeEventListener("abort", abort);
                        reject(new Error("项目 CSS 加载失败"));
                    };
                    document.head.append(stylesheet);
                });
                break;
            case 404:
                break;
            default:
                throw new Error(`项目 CSS 探测失败：HTTP ${cssResponse.status}`);
        }
        if (destroyed) return destroy;
        const bridgeURL = new URL("./bridge.mjs", document.baseURI);
        const bridgeResponse = await fetch(bridgeURL, { method: "HEAD", cache: "no-store", signal: controller.signal });
        if (destroyed) return destroy;
        let factory;
        switch (bridgeResponse.status) {
            case 200:
                factory = (await import(bridgeURL.href)).default;
                break;
            case 404:
                factory = browserHost;
                break;
            default:
                throw new Error(`Bridge 探测失败：HTTP ${bridgeResponse.status}`);
        }
        if (destroyed) return destroy;
        document.title = config.title;
        menu = new ActionMenu(id => frame.perform(id));
        host = await factory({ menu, back: () => (navigation.current && frame ? frame.back() : navigation.back()) });
        if (destroyed) {
            host.destroy();
            menu.destroy();
            return destroy;
        }
        const container = document.querySelector("[data-preference-panes-pages]");
        const home = document.querySelector("[data-preference-panes-home]");
        const template = document.querySelector("template[data-preference-panes-module]");
        renderHome(config, jsonURL, home);
        const buttons = [...home.querySelectorAll("[data-module]")];
        const links = [...home.querySelectorAll("a[href]")];
        const stylesheetURL = stylesheet?.href;
        const update = () => {
            if (destroyed) return;
            const state = navigation.current && frame ? frame.state : { title: navigation.current ? linkTitle : document.title, actions: [], busy: false, canGoBack: navigation.canGoBack };
            menu.update(state.actions, state.busy);
            Promise.resolve(host.update(state)).catch(error => {
                if (!destroyed) host.notice({ kind: "error", message: error.message });
            });
        };
        navigation = new Navigation(container, home, (module, signal) => {
            frame = undefined;
            const link = links.find((link, index) => link.dataset.target === "internal" && module === `link:${index}`);
            if (link) {
                const page = document.createElement("section");
                page.dataset.preferencePanesLinkPage = "";
                const iframe = document.createElement("iframe");
                linkTitle = link.querySelector(".pp-home-name").textContent;
                iframe.title = linkTitle;
                iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
                iframe.src = link.href;
                page.append(iframe);
                signal.addEventListener("abort", () => iframe.remove(), { once: true });
                return page;
            }
            const button = buttons.find(button => button.dataset.module === module);
            if (!button) return;
            const page = template.content.firstElementChild.cloneNode(true);
            page.dataset.preferencePanesModulePage = "";
            const message = page.querySelector("[data-module-message]");
            const moduleName = encodeURIComponent(button.dataset.preferencePanesModule ?? module);
            const current = new ModuleFrame(`/settings/${moduleName}`, {
                signal,
                headers: { "X-PreferencePanes-JSON": `/api/${encodeURIComponent(module)}`, ...(stylesheetURL ? { "X-PreferencePanes-CSS": stylesheetURL } : {}) },
            });
            frame = current;
            current.addEventListener("confirm", event => {
                event.preventDefault();
                Promise.resolve()
                    .then(() => host.confirm(event.detail.message))
                    .then(
                        value => {
                            if (!signal.aborted) event.detail.resolve(value);
                        },
                        error => {
                            if (!signal.aborted) event.detail.reject(error);
                        },
                    );
            });
            current.addEventListener("notice", event => {
                event.preventDefault();
                host.notice(event.detail);
            });
            current.addEventListener("open-url", event => {
                event.preventDefault();
                Promise.resolve()
                    .then(() => host.openURL(event.detail.url))
                    .catch(error => {
                        if (!signal.aborted) host.notice({ kind: "error", message: error.message });
                    });
            });
            current.addEventListener("change", () => {
                if (!signal.aborted) update();
            });
            current.element.onload = () => {
                if (!signal.aborted) message.hidden = true;
            };
            page.append(current.element);
            current.load().catch(error => {
                if (!signal.aborted) message.textContent = error.message;
            });
            return page;
        });
        for (const [index, link] of links.entries()) {
            link.addEventListener(
                "click",
                event => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    switch (link.dataset.target) {
                        case "internal":
                            navigation.open(`link:${index}`);
                            break;
                        default:
                            try {
                                Promise.resolve(host.openURL(link.href, link.dataset.target)).catch(error => {
                                    if (!destroyed) host.notice({ kind: "error", message: error.message });
                                });
                            } catch (error) {
                                if (!destroyed) host.notice({ kind: "error", message: error.message });
                            }
                            break;
                    }
                },
                { signal: controller.signal },
            );
        }
        statuses = buttons.map(button => {
            const status = new ModuleStatus(button.querySelector("[data-module-status]"));
            status.addEventListener("change", () => {
                button.disabled = status.state.status !== "installed";
            });
            button.addEventListener("click", () => navigation.open(button.dataset.module), { signal: controller.signal });
            return { button, status };
        });
        const probe = () => {
            update();
            if (navigation.current) return;
            for (const { button, status } of statuses) status.check(`/api/${encodeURIComponent(button.dataset.module)}`);
        };
        navigation.addEventListener("change", probe);
        probe();
        return destroy;
    } catch (error) {
        const display = !destroyed;
        destroy();
        if (display) {
            const message = document.createElement("p");
            message.className = "pp-host-error";
            message.setAttribute("role", "alert");
            message.textContent = `无法打开设置：${error.message}`;
            document.body.prepend(message);
        }
        throw error;
    }
}
