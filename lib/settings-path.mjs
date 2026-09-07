/**
 * 将 /api/ 后的 URL 路径转换为 util 的路径片段；非 API 路径不处理。
 * Convert URL segments after /api/ to util path segments; ignore non-API paths.
 * @param {string} url 请求完整 URL / Absolute request URL.
 * @returns {string[] | undefined} 键路径片段 / Key path segments.
 * @throws {TypeError} API 路径无效或包含危险片段 / Invalid or unsafe API path.
 */
export function parseSettingsPath(url) {
  const pathname = new URL(url).pathname;
  if (!pathname.startsWith("/api/")) return;
  let parts;
  try {
    parts = pathname.slice(5).split("/").map(decodeURIComponent);
  } catch {
    throw new TypeError("Invalid encoded key path");
  }
  if (!parts.every((part) => /^[a-zA-Z0-9_-]+$/.test(part) && !["__proto__", "prototype", "constructor"].includes(part)))
    throw new TypeError("Invalid key path");
  return parts;
}
