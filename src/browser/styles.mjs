import defaults from "#styles";

const selector = "style[data-preference-panes-defaults]";

/**
 * 在文档中安装一次默认样式，并标记当前调用方是否拥有该节点。
 * Install default styles once and report whether the current caller owns the node.
 * @param {Document} document 目标文档 / Target document.
 * @returns {{element: HTMLStyleElement, owned: boolean}} 样式节点及所有权 / Style node and ownership.
 */
export function installDefaultStyles(document) {
    const existing = document.head.querySelector(selector);
    if (existing) return { element: existing, owned: false };
    const element = document.createElement("style");
    element.dataset.preferencePanesDefaults = "";
    element.textContent = defaults;
    document.head.append(element);
    return { element, owned: true };
}
