import { readFile } from "node:fs/promises";
import styles from "../src/browser/official-styles.json" with { type: "json" };

/**
 * 仅供本地预览显式启用的官方资源 override，不参与发布构建。
 * Explicit local-preview overrides for official resources, excluded from production builds.
 * @returns {Promise<{asset: (path: string) => Buffer | undefined, rewrite: (source: string) => string}>} 测试资源与地址改写 / Test assets and URL rewriting.
 */
export async function loadOfficialOverrides() {
    const assets = new Map();
    for (const file of Object.values(styles)) assets.set(`/__official__/${file}`, await readFile(new URL(`../test/fixtures/official-styles/${file}`, import.meta.url)));
    return {
        asset: path => assets.get(path),
        rewrite(source) {
            for (const [url, file] of Object.entries(styles)) source = source.replaceAll(url, `/__official__/${file}`);
            return source;
        },
    };
}
