import { URL } from "@nsnanocat/url";

/**
 * 将 /api/ 后的 URL 路径转换为 util 的路径片段；非 API 路径不处理。
 * Convert URL segments after /api/ to util path segments; ignore non-API paths.
 * @param {string} url 请求完整 URL / Absolute request URL.
 * @returns {string[] | undefined} 键路径片段 / Key path segments.
 * @throws {TypeError} API 路径无效或包含危险片段 / Invalid or unsafe API path.
 */
export function parseSettingsPath(url) {
	return parseSettingsPathname(new URL(url).pathname);
}

/**
 * 解析已经取得的 pathname，避免重复构造 URL。
 * Parse an existing pathname without constructing another URL.
 * @param {string} pathname 以 / 开头的 URL pathname / URL pathname beginning with /.
 * @returns {string[] | undefined} 解码后的路径，非 API 路径不处理 / Decoded path, or undefined outside /api/.
 * @throws {TypeError} 转义编码或路径片段非法 / Invalid percent encoding or path segments.
 */
export function parseSettingsPathname(pathname) {
	if (!pathname.startsWith("/api/")) return;
	let parts;
	try {
		parts = pathname.slice(5).replace(/\/$/, "").split("/").map(decodeURIComponent);
	} catch {
		throw new TypeError("Invalid encoded key path");
	}
	return validatePathParts(parts);
}

/**
 * 校验原始路径片段，不进行 URL 编码转换。
 * Validate raw path segments without URL encoding conversion.
 * @param {string[]} parts 原始路径片段 / Raw path segments.
 * @returns {string[]} 同一数组，不复制或修改 / The same array without copying or mutation.
 * @throws {TypeError} 空片段、非法字符或原型属性名 / Empty segments, invalid characters or prototype property names.
 */
export function validatePathParts(parts) {
	if (!parts.every(part => typeof part === "string" && /^[a-zA-Z0-9_-]+$/.test(part) && !["__proto__", "prototype", "constructor"].includes(part))) throw new TypeError("Invalid key path");
	return parts;
}
