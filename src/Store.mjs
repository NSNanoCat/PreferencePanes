import { Lodash as _ } from "@nsnanocat/util/polyfill/Lodash.mjs";
import { Storage } from "@nsnanocat/util/polyfill/Storage";
import { validatePathParts } from "./lib/settings-path.mjs";

/**
 * 模块 API 内部的持久化存储桥接。
 * Internal persistence bridge used by the module API.
 */
export class Store {
    /**
     * 读取完整 @root.path，缺失时返回 undefined。
     * Read a complete @root.path and return undefined when it does not exist.
     * @param {string} keyName 完整存储路径 / Complete storage path.
     * @returns {unknown} 存储值或 undefined / Stored value or undefined.
     */
    read(keyName) {
        const [storageKey, ...path] = parseKey(keyName);
        const root = Storage.getItem(storageKey);
        if (!isRecord(root)) return undefined;
        const parent = storageParent(root, path, false);
        return parent ? _.get(parent, [path.at(-1)]) : undefined;
    }

    /**
     * 写入完整 @root.path。
     * Write a complete @root.path.
     * @param {string} keyName 完整存储路径 / Complete storage path.
     * @param {unknown} value 可序列化值 / Serializable value.
     * @returns {boolean} 是否写入成功 / Whether persistence succeeded.
     */
    write(keyName, value) {
        const [storageKey, ...path] = parseKey(keyName);
        const root = this.#root(storageKey);
        _.set(storageParent(root, path, true), [path.at(-1)], value);
        return Storage.setItem(storageKey, root);
    }

    /**
     * 删除完整 @root.path；路径缺失也会写回当前根。
     * Delete a complete @root.path; a missing path still writes the current root.
     * @param {string} keyName 完整存储路径 / Complete storage path.
     * @returns {boolean} 是否写回成功 / Whether persistence succeeded.
     */
    remove(keyName) {
        const [storageKey, ...path] = parseKey(keyName);
        const root = this.#root(storageKey);
        const parent = storageParent(root, path, false);
        if (parent) _.unset(parent, [path.at(-1)]);
        return Storage.setItem(storageKey, root);
    }

    #root(storageKey) {
        const root = Storage.getItem(storageKey, {});
        if (!isRecord(root)) throw new TypeError("Stored root must be an object");
        return root;
    }
}

/**
 * 解析并校验完整存储路径。
 * Parse and validate a complete storage path.
 * @param {string} keyName 完整 @root.path / Complete @root.path.
 * @returns {string[]} 不含 @ 的路径片段 / Path segments without @.
 */
function parseKey(keyName) {
    if (typeof keyName !== "string" || !keyName.startsWith("@")) throw new TypeError("Storage keys must start with @");
    const parts = validatePathParts(keyName.slice(1).split("."));
    if (parts.length < 2) throw new TypeError("Specify a storage root and child path");
    return parts;
}

/**
 * 判断根节点是否为普通对象。
 * Determine whether a root node is a plain object.
 * @param {unknown} value 待检查值 / Value to inspect.
 * @returns {boolean} 是否为普通对象 / Whether this is a plain object.
 */
function isRecord(value) {
    return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * 遍历父路径，兼容旧存储中 JSON 字符串形式的中间节点。
 * Traverse parents, supporting legacy intermediate nodes serialized as JSON strings.
 * @param {Record<string, unknown>} root 存储根 / Stored root.
 * @param {string[]} parts 完整路径 / Complete path.
 * @param {boolean} create 是否创建缺失节点 / Whether to create missing parents.
 * @returns {object | undefined} 父节点，缺失且不创建时为 undefined / Parent, or undefined when absent and not creating.
 */
function storageParent(root, parts, create) {
    let parent = root;
    for (const part of parts.slice(0, -1)) {
        let next = _.get(parent, [part]);
        switch (typeof next) {
            case "undefined":
                if (!create) return;
                next = {};
                break;
            case "string":
                next = JSON.parse(next);
                break;
        }
        if (!isRecord(next) && !Array.isArray(next)) throw new TypeError("Stored parent is not an object or array");
        _.set(parent, [part], next);
        parent = next;
    }
    return parent;
}
