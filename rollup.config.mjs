import { readFile } from "node:fs/promises";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import pkg from "./package.json" with { type: "json" };

/**
 * 页面样式由包自身编译，静态页面与浏览器包使用同一套产物。
 * Compile page styles inside the package for both static pages and the browser package.
 * @returns {import("rollup").Plugin} 内部资源插件 / Internal resource plugin.
 */
function resources() {
    return {
        name: "preference-resources",
        resolveId(id) {
            if (id === "#styles") return id;
        },
        async load(id) {
            switch (id) {
                case "#styles":
                    return `export default ${JSON.stringify(await readFile(new URL("./src/browser/panel.css", import.meta.url), "utf8"))};`;
                default:
                    return null;
            }
        },
    };
}

/**
 * 前端不包含代理 polyfill；页面资源分别输出为可直接映射的静态文件。
 * Keep proxy polyfills out of the browser and emit page resources as directly mapped static files.
 * @type {import("rollup").RollupOptions[]}
 */
export default [
    { input: "src/browser/mount.mjs", output: { file: "dist/preference-panes.mjs", format: "es" } },
    { input: "src/browser/Navigation.mjs", output: { file: "dist/module/navigation.mjs", format: "es" } },
    { input: "src/api.mjs", output: { file: "dist/api.js", format: "iife" } },
    {
        input: "src/browser/index.mjs",
        output: { file: "dist/module/index.mjs", format: "es" },
        plugins: [
            {
                name: "page-shell",
                async generateBundle() {
                    const html = await readFile(new URL("./src/browser/module.html", import.meta.url), "utf8");
                    this.emitFile({ type: "asset", fileName: "index.html", source: html.replace("<!--__PREFERENCE_PANES_JSON__-->", "").replace("<!--__PREFERENCE_PANES_STYLESHEET__-->", "").replaceAll("__VERSION__", pkg.version) });
                },
            },
        ],
    },
].map(config => ({
    ...config,
    plugins: [nodeResolve({ browser: true }), resources(), ...(config.plugins ?? [])],
    onwarn(warning) {
        throw new Error(warning.message);
    },
}));
