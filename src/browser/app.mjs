import { validatePathParts } from "../lib/settings-path.mjs";
import { createPreferencesClient } from "./client.mjs";
import { mountPreferencePanes } from "./panel.mjs";

/**
 * 自包含页面入口，业务名称、图标和入口全部从站点 BoxJS JSON 读取。
 * Self-contained page entry reading all branding, icons and navigation from site BoxJS JSON.
 * @module @nsnanocat/preference-panes/site
 */
const root = document.querySelector("#preferences");
const client = createPreferencesClient({ timeout: 3500 });
const theme = navigator.userAgent.match(/themeId\/(\d+)/)?.[1];
if (theme) document.documentElement.dataset.theme = theme === "2" ? "dark" : "light";
let panel,
	menu,
	revision = 0,
	routedPath;

/**
 * 创建只含纯文本的元素。
 * Create an element containing plain text only.
 * @param {string} tag 标签 / Tag.
 * @param {string} className 样式 / CSS class.
 * @param {string} [text] 文本 / Text.
 * @returns {HTMLElement} 元素 / Element.
 */
function node(tag, className, text) {
	const element = document.createElement(tag);
	element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

/**
 * 按站点 JSON 显示图标；iconDark 是明确的暗色扩展，不改变 BoxJS icons 语义。
 * Display configured icons; iconDark is an explicit dark variant without changing BoxJS icons semantics.
 * @param {{icon?:string,iconDark?:string,icons?:string[]}} metadata 图标数据 / Icon data.
 * @param {string} className 样式 / CSS class.
 * @returns {HTMLPictureElement} 图片元素 / Picture element.
 */
function icon(metadata, className) {
	const picture = node("picture", className),
		image = node("img", "");
	if (metadata.iconDark) {
		const source = node("source", "");
		source.media = theme ? (theme === "2" ? "all" : "not all") : "(prefers-color-scheme: dark)";
		source.srcset = resourceURL(metadata.iconDark);
		picture.append(source);
	}
	const selected = metadata.icon || metadata.icons?.[1] || metadata.icons?.[0];
	if (selected) image.src = resourceURL(selected);
	image.alt = "";
	picture.append(image);
	return picture;
}

/**
 * 校验配置中的资源 URL。
 * Validate resource URLs in site configuration.
 * @param {string} value 地址 / Address.
 * @returns {string} 完整 URL / Absolute URL.
 */
function resourceURL(value) {
	const url = new URL(value, location.href);
	if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Resources must use HTTP(S)");
	return url.href;
}

/**
 * 挂载通用设置或站点菜单，每次进入菜单都重新 HEAD 探测。
 * Mount settings or the site menu, repeating HEAD probes on every menu entry.
 * @returns {Promise<void>} 挂载完成 / Mount completion.
 */
async function render() {
	routedPath = location.pathname;
	const version = ++revision;
	panel?.destroy();
	panel = undefined;
	root.replaceChildren();
	if (routedPath !== "/settings/") {
		document.title = routedPath.split("/")[2] || "Preferences";
		panel = mountPreferencePanes({ element: root });
		return;
	}
	try {
		if (!menu) {
			const response = await fetch("/settings/assets/site.boxjs.json", { cache: "no-store", credentials: "omit" });
			if (response.status !== 200) throw new Error(`Site config HTTP ${response.status}`);
			const data = await response.json();
			if (typeof data.name !== "string" || !Array.isArray(data.apps)) throw new TypeError("Invalid site BoxJS JSON");
			for (const app of data.apps) validatePathParts([app.module]);
			const localStyles = document.head.querySelector('link[rel="stylesheet"]');
			for (const href of data.stylesheets ?? []) {
				const link = document.createElement("link");
				link.rel = "stylesheet";
				link.href = resourceURL(href);
				document.head.insertBefore(link, localStyles);
			}
			menu = data;
		}
		if (version !== revision) return;
		document.title = menu.name;
		const home = node("section", "pp-home");
		home.append(icon(menu, "brand-logo"), node("h1", "", menu.name));
		const section = node("section", "self-panel is-zh");
		section.append(node("h2", "header", menu.sectionTitle ?? "模块"));
		const container = node("div", "container"),
			scrollView = node("div", "scroll-view"),
			rows = node("div", "scroll");
		scrollView.append(rows);
		container.append(scrollView);
		section.append(container);
		home.append(section);
		if (menu.desc) home.append(node("p", "settings-note", menu.desc));
		root.append(home);
		for (const app of menu.apps) {
			const button = node("button", "self-item is-zh"),
				status = node("span", "module-status", "检测中");
			button.type = "button";
			button.disabled = true;
			button.dataset.module = app.module;
			button.append(icon(app, "logo"), node("span", "name", app.name ?? app.module), status);
			rows.append(button);
			button.onclick = () => {
				history.pushState(null, "", `/settings/${app.module}`);
				render();
				if (!matchMedia("(prefers-reduced-motion: reduce)").matches) root.animate([{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], { duration: 260, easing: "ease-out" });
			};
			client.probe(app.module).then(available => {
				if (revision !== version) return;
				button.disabled = !available;
				status.textContent = available ? "" : "未响应";
			});
		}
	} catch (error) {
		if (version === revision) {
			const retry = node("button", "", "重新读取");
			retry.type = "button";
			retry.onclick = render;
			root.replaceChildren(node("p", "pp-site-error", `加载失败：${error.message}`), retry);
		}
	}
}

window.addEventListener("popstate", () => {
	if (routedPath !== location.pathname) {
		render();
		if (location.pathname === "/settings/" && !matchMedia("(prefers-reduced-motion: reduce)").matches) root.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }], { duration: 260, easing: "ease-out" });
	}
});
window.addEventListener("pageshow", event => {
	if (event.persisted && location.pathname === "/settings/") render();
});
render();
