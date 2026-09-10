/**
 * 共用三点按钮和底部操作菜单；弹层挂载到文档根部，不受标题栏显示状态影响。
 * Shared overflow trigger and bottom action sheet; the layer is mounted at document level and remains independent of header visibility.
 */
export class ActionMenu {
    #button;
    #layer;
    #items;
    #select;
    #document;
    #disabled = true;
    #key = event => {
        if (event.key === "Escape" && !this.#layer.hidden) {
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
        const triggerRoot = this.element.attachShadow({ mode: "open" });
        triggerRoot.innerHTML = `<style>
          :host{display:inline-flex;width:44px;height:44px;color:inherit}
          :host([hidden]){display:none!important}
          button{width:44px;height:44px;padding:10px;font:inherit;cursor:pointer;border:0;color:inherit;background:none}
          button:disabled{opacity:.4;cursor:default}
          button:focus-visible{outline:2px solid currentColor;outline-offset:-3px}
          svg{display:block;width:24px;height:24px;fill:currentColor}
        </style><button type="button" aria-label="更多操作" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="12" r="2"/></svg></button>`;
        this.#button = triggerRoot.querySelector("button");
        this.#layer = document.createElement("span");
        const layerRoot = this.#layer.attachShadow({ mode: "open" });
        layerRoot.innerHTML = `<style>
          :host{position:fixed;inset:0;z-index:2147483647;color:var(--pp-text,CanvasText);font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
          :host([hidden]){display:none!important}
          button{font:inherit;cursor:pointer;border:0;color:inherit;background:none}
          button:focus-visible{outline:2px solid var(--pp-accent,Highlight);outline-offset:-3px}
          #backdrop{position:absolute;inset:0;width:100%;height:100%;padding:0;background:#0008;animation:pp-fade-in .18s ease-out}
          #sheet{position:absolute;z-index:1;left:0;right:0;bottom:0;width:min(100%,540px);max-height:calc(100% - 24px);margin:auto;padding:8px 8px calc(8px + env(safe-area-inset-bottom));animation:pp-sheet-in .22s cubic-bezier(.2,.8,.2,1)}
          #items,#cancel{overflow:hidden;background:var(--pp-surface,Canvas);border:1px solid var(--pp-border,#8884);border-radius:14px;box-shadow:0 8px 28px #0004}
          #items{max-height:calc(100vh - 116px - env(safe-area-inset-bottom));overflow-y:auto;-webkit-overflow-scrolling:touch}
          #items button,#cancel{display:block;width:100%;min-height:54px;padding:14px 18px;text-align:center}
          #items button+button{border-top:1px solid var(--pp-border,#8884)}
          #items button[data-danger]{color:var(--pp-danger,#e45656)}
          #cancel{margin-top:8px;color:var(--pp-accent,Highlight);font-weight:600}
          @keyframes pp-fade-in{from{opacity:0}}
          @keyframes pp-sheet-in{from{transform:translateY(100%)}}
          @media (prefers-reduced-motion:reduce){#backdrop,#sheet{animation:none}}
        </style><button id="backdrop" type="button" tabindex="-1" aria-label="关闭菜单"></button><section id="sheet" role="dialog" aria-modal="true" aria-label="更多操作"><div id="items" role="menu"></div><button id="cancel" type="button">取消</button></section>`;
        this.#items = layerRoot.querySelector("#items");
        this.#button.onclick = () => (this.#layer.hidden ? this.open() : this.close());
        layerRoot.querySelector("#backdrop").onclick = () => {
            this.close();
            this.#button.focus();
        };
        layerRoot.querySelector("#cancel").onclick = () => {
            this.close();
            this.#button.focus();
        };
        this.#items.onkeydown = event => {
            const items = [...this.#items.children];
            const index = items.indexOf(layerRoot.activeElement);
            const offsets = { ArrowDown: 1, ArrowUp: -1 };
            if (event.key in offsets) {
                event.preventDefault();
                items[(index + offsets[event.key] + items.length) % items.length].focus();
            }
        };
        document.body.append(this.#layer);
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
        this.#disabled = disabled || items.length === 0;
        this.#button.disabled = this.#disabled;
        this.#items.replaceChildren(
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
     * 打开当前操作菜单。
     * Open the current action sheet.
     * @returns {void} 无返回值 / No return value.
     */
    open() {
        if (this.#disabled) return;
        const style = getComputedStyle(this.element);
        for (const property of ["--pp-text", "--pp-surface", "--pp-border", "--pp-accent", "--pp-danger"]) {
            const value = style.getPropertyValue(property);
            if (value) this.#layer.style.setProperty(property, value);
        }
        this.#layer.hidden = false;
        this.#button.setAttribute("aria-expanded", "true");
        this.#items.firstElementChild.focus();
    }

    /**
     * 关闭菜单。
     * Close the menu.
     * @returns {void} 无返回值 / No return value.
     */
    close() {
        this.#layer.hidden = true;
        this.#button.setAttribute("aria-expanded", "false");
    }

    /**
     * 移除监听器与节点。
     * Remove listeners and elements.
     * @returns {void} 无返回值 / No return value.
     */
    destroy() {
        this.#document.removeEventListener("keydown", this.#key);
        this.#layer.remove();
        this.element.remove();
    }
}
