import { readFile } from "node:fs/promises";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import pkg from "./package.json" with { type: "json" };
import officialStyles from "./src/browser/official-styles.json" with { type: "json" };

/**
 * 页面资源由包自身编译，代理和静态站点使用同一套产物。
 * Compile page resources inside the package for both proxy and static hosting.
 * @returns {import("rollup").Plugin} 内部资源插件 / Internal resource plugin.
 */
function resources() {
    return {
        name: "preference-resources",
        resolveId(id) {
            if (id === "#styles" || id === "#style-urls" || id === "#assets") return id;
        },
        async load(id) {
            switch (id) {
                case "#styles":
                    return `export default ${JSON.stringify(await readFile(new URL("./src/browser/panel.css", import.meta.url), "utf8"))};`;
                case "#style-urls":
                    return `export default ${JSON.stringify(Object.keys(officialStyles))};`;
                case "#assets": {
                    const bundle = await rollup({ input: "src/browser/app.mjs", plugins: [nodeResolve({ browser: true }), resources()] });
                    try {
                        const app = await bundle.generate({ format: "es" });
                        const html = (await readFile(new URL("./src/browser/module.html", import.meta.url), "utf8")).replaceAll("__VERSION__", pkg.version);
                        return `export default ${JSON.stringify({ page: { type: "text/html", body: html }, "/settings/assets/app.mjs": { type: "text/javascript", body: app.output[0].code } })};`;
                    } finally {
                        await bundle.close();
                    }
                }
                default:
                    return null;
            }
        },
    };
}

/**
 * 前端不包含代理 polyfill；代理资源与脚本由包统一打包。
 * Keep proxy polyfills out of the browser and bundle all proxy resources inside the package.
 * @type {import("rollup").RollupOptions[]}
 */
export default [
    { input: "src/browser/index.mjs", output: { file: "dist/preference-panes.mjs", format: "es" } },
    { input: "src/browser/Navigation.mjs", output: { file: "dist/module/navigation.mjs", format: "es" } },
    { input: "src/proxy/handler.mjs", output: { file: "dist/api.js", format: "iife" } },
    {
        input: "src/browser/app.mjs",
        output: { file: "dist/module/app.mjs", format: "es" },
        plugins: [
            {
                name: "page-shell",
                async generateBundle() {
                    const html = await readFile(new URL("./src/browser/module.html", import.meta.url), "utf8");
                    this.emitFile({ type: "asset", fileName: "index.html", source: html.replaceAll("__VERSION__", pkg.version) });
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
