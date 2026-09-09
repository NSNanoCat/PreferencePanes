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
