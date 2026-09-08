import { nodeResolve } from "@rollup/plugin-node-resolve";

/**
 * 分别构建浏览器 ESM 与代理 IIFE，不把 Node 专用适配打入包中。
 * Build browser ESM and proxy IIFE separately without bundling Node-specific adapters.
 * @type {import("rollup").RollupOptions[]}
 */
export default [
	{ input: "src/browser/index.mjs", output: { file: "dist/preference-panes.mjs", format: "es" } },
	{ input: "src/proxy/request.mjs", output: { file: "dist/preference-panes.request.js", format: "iife" } },
].map(config => ({
	...config,
	plugins: [nodeResolve({ browser: true })],
	onwarn(warning) {
		throw new Error(warning.message);
	},
}));
