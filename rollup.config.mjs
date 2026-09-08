import { readFile } from "node:fs/promises";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import pkg from "./package.json" with { type: "json" };

/**
 * 分别构建浏览器 ESM 与代理 IIFE，不把 Node 专用适配打入包中。
 * Build browser ESM and proxy IIFE separately without bundling Node-specific adapters.
 * @type {import("rollup").RollupOptions[]}
 */
export default [
	{ input: "src/browser/index.mjs", output: { file: "dist/preference-panes.mjs", format: "es" } },
	{ input: "src/proxy/request.mjs", output: { file: "dist/preference-panes.request.js", format: "iife" } },
	{
		input: "src/browser/app.mjs",
		output: { file: "dist/settings/app.mjs", format: "es" },
		plugins: [
			{
				name: "settings-assets",
				async generateBundle() {
					for (const [fileName, source] of [
						["index.html", "site.html"],
						["panel.css", "panel.css"],
						["home.css", "home.css"],
					]) {
						const content = await readFile(new URL(`./src/browser/${source}`, import.meta.url), "utf8");
						this.emitFile({ type: "asset", fileName, source: content.replaceAll("__VERSION__", pkg.version) });
					}
				},
			},
		],
	},
].map(config => ({
	...config,
	plugins: [nodeResolve({ browser: true }), ...(config.plugins ?? [])],
	onwarn(warning) {
		throw new Error(warning.message);
	},
}));
