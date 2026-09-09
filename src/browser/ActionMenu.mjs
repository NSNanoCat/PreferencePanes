/**
 * 标题栏共用三点菜单；Shadow DOM 隔离项目样式，保留继承的主题色。
 * Shared title-bar overflow menu; Shadow DOM isolates layout while inheriting theme colors.
 */
export class ActionMenu {
    #button;
    #popup;
    #backdrop;
    #select;
    #document;
    #key = event => {
        if (event.key === "Escape" && !this.#popup.hidden) {
            event.preventDefault();
            this.close();
            this.#button.focus();
        }
    };

    /**
     * 创建菜单，操作逻辑由调用方提供。
     * Create a menu whose actions are handled by the caller.
     * @param {(id: string) => void} select 菜单选择回调 / Selection callback.
     */
    constructor(select) {
        this.#document = document;
        this.#select = select;
        this.element = document.createElement("span");
        const root = this.element.attachShadow({ mode: "open" });
        root.innerHTML = `<style>
          :host{display:inline-flex;position:relative;width:44px;height:44px;color:inherit}
          :host([hidden]),[hidden]{display:none!important}
          button{font:inherit;cursor:pointer;border:0;color:inherit;background:none}
          button:disabled{opacity:.4;cursor:default}
          button:focus-visible{outline:2px solid currentColor;outline-offset:-3px}
          #trigger{width:44px;height:44px;padding:10px;position:relative;z-index:3}
          svg{display:block;width:24px;height:24px;fill:currentColor}
          #backdrop{position:fixed;inset:0;z-index:1}
          #items{position:absolute;right:0;top:46px;z-index:2;min-width:160px;padding:6px;background:var(--pp-surface,Canvas);color:var(--pp-text,CanvasText);border:1px solid var(--pp-border,#8884);border-radius:12px;box-shadow:0 8px 28px #0003}
          #items button{display:block;text-align:left;white-space:nowrap;width:100%;padding:11px 14px;border-radius:8px;font:14px/1.4 system-ui,sans-serif}
          #items button:hover{background:#8882}
          #items button[data-danger]{color:#e45656}
        </style><button id="trigger" type="button" aria-label="更多操作" aria-haspopup="menu" aria-expanded="false" aria-controls="items"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="12" r="2"/></svg></button><button id="backdrop" type="button" tabindex="-1" aria-label="关闭菜单" hidden></button><div id="items" role="menu" hidden></div>`;
        this.#button = root.querySelector("#trigger");
        this.#popup = root.querySelector("#items");
        this.#backdrop = root.querySelector("#backdrop");
        this.#button.onclick = () => {
            const open = this.#popup.hidden;
            this.#popup.hidden = this.#backdrop.hidden = !open;
            this.#button.setAttribute("aria-expanded", String(open));
            if (open) this.#popup.firstElementChild.focus();
        };
        this.#backdrop.onclick = () => this.close();
        this.#popup.onkeydown = event => {
            if (event.key === "Tab") {
                this.close();
                return;
            }
            const items = [...this.#popup.children];
            const index = items.indexOf(root.activeElement);
            const offsets = { ArrowDown: 1, ArrowUp: -1 };
            if (event.key in offsets) {
                event.preventDefault();
                items[(index + offsets[event.key] + items.length) % items.length].focus();
            }
        };
        document.addEventListener("keydown", this.#key);
        this.update([]);
    }

    /**
     * 同步可用操作和忙碌状态，不重建菜单触发按钮。
     * Update actions and busy state without replacing the trigger button.
     * @param {Array<{id: string, label: string, destructive?: boolean}>} items 操作列表 / Actions.
     * @param {boolean} [disabled] 是否忙碌 / Whether operations are busy.
     * @returns {void} 无返回值 / No return value.
     */
    update(items, disabled = false) {
        this.close();
        this.#button.disabled = disabled || items.length === 0;
        this.#popup.replaceChildren(
            ...items.map(item => {
                const button = this.#document.createElement("button");
                button.type = "button";
                button.setAttribute("role", "menuitem");
                button.textContent = item.label;
                button.toggleAttribute("data-danger", Boolean(item.destructive));
                button.onclick = () => {
                    this.close();
                    this.#select(item.id);
                };
                return button;
            }),
        );
    }

    /**
     * 关闭菜单。
     * Close the menu.
     * @returns {void} 无返回值 / No return value.
     */
    close() {
        this.#popup.hidden = this.#backdrop.hidden = true;
        this.#button.setAttribute("aria-expanded", "false");
    }

    /**
     * 移除监听器与节点。
     * Remove listeners and elements.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#document.removeEventListener("keydown", this.#key);
        this.element.remove();
    }
}
