import { createPreferencesClient } from "./client.mjs";

/**
 * 挂载从 BoxJS 实时生成的设置面板和短暂通知。
 * Mount runtime-generated BoxJS controls and transient notifications.
 * @param {import("../types/browser.js").PreferencesPanelOptions} options 容器与请求；模块由页面 URL 的 module 参数指定 / Container and requests; module comes from the page URL.
 * @returns {{destroy(): void}} 清理接口 / Cleanup handle.
 */
export function mountPreferencePanes({ element: root, fetch, title = "Preferences" }) {
  const document = root.ownerDocument;
  const window = document.defaultView;
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const shell = node("div", "pp-panel");
  const header = node("header", "pp-header");
  const back = node("button", "pp-back", "返回");
  back.type = "button";
  const heading = node("h1", "pp-title", title);
  const viewport = node("div", "pp-viewport");
  const toast = node("div", "pp-toast");
  toast.setAttribute("role", "status");
  toast.hidden = true;
  header.append(back, heading);
  shell.append(header, viewport, toast);
  root.append(shell);
  let timer,
    routedSearch,
    generation = 0,
    active = null,
    saving = false,
    pendingRoute = false,
    destroyed = false;
  const notify = (event) => {
    if (destroyed) return;
    toast.textContent = event.kind === "error" ? `操作失败：${event.message}` : event.operation === "delete" ? "删除成功" : "修改成功";
    toast.dataset.kind = event.kind;
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  };
  const client = createPreferencesClient({ ...(fetch ? { fetch } : {}), notify });
  function replace(view, direction) {
    const old = viewport.firstElementChild;
    viewport.replaceChildren(view);
    if (old && !document.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches)
      view.animate(
        [
          { opacity: 0.4, transform: `translateX(${direction * 24}px)` },
          { opacity: 1, transform: "translateX(0)" },
        ],
        { duration: 180, easing: "ease-out" },
      );
  }
  async function open(module) {
    const version = ++generation;
    active = module;
    back.disabled = window.history.length <= 1;
    heading.textContent = module;
    replace(node("p", "pp-loading", "读取设置…"), 1);
    try {
      await client.open(module);
      if (version === generation) controls();
    } catch (error) {
      if (version !== generation) return;
      const view = node("section", "pp-error");
      view.append(node("p", "", `加载失败：${error.message}`));
      const retry = node("button", "", "重新读取");
      retry.onclick = () => open(module);
      view.append(retry);
      replace(view, 1);
    }
  }
  function controls() {
    const { definition, values } = client.snapshot(active);
    const view = node("section", "pp-fields");
    for (const field of definition.fields) {
      const row = node("fieldset", "pp-field");
      row.append(node("legend", "", field.name));
      if (field.description) row.append(node("p", "pp-description", field.description));
      const value = values[field.key];
      let read, write;
      if (field.options && field.type !== "array") {
        const select = node("select", "pp-input");
        select.setAttribute("aria-label", field.name);
        field.options.forEach((option, index) => {
          const item = node("option", "", option.label);
          item.value = String(index);
          select.append(item);
        });
        write = (value) => {
          select.selectedIndex = field.options.findIndex((option) => option.key === value);
        };
        row.append(select);
        read = () => field.options[select.selectedIndex]?.key;
      } else if (field.type === "array" && field.options) {
        const inputs = field.options.map((option) => {
          const label = node("label", "pp-choice", option.label);
          const input = node("input", "");
          input.type = "checkbox";
          input.checked = Array.isArray(value) && value.includes(option.key);
          label.prepend(input);
          row.append(label);
          return { input, key: option.key };
        });
        read = () => inputs.filter((option) => option.input.checked).map((option) => option.key);
        write = (value) => {
          for (const option of inputs) option.input.checked = Array.isArray(value) && value.includes(option.key);
        };
      } else {
        const input = node(field.type === "array" ? "textarea" : "input", "pp-input");
        input.setAttribute("aria-label", field.name);
        if (field.type === "boolean") {
          input.type = "checkbox";
          write = (value) => {
            input.checked = value === true;
          };
          read = () => input.checked;
        } else {
          input.type = field.type === "number" ? "number" : "text";
          write = (value) => {
            input.value = field.type === "array" ? JSON.stringify(value ?? []) : (value ?? "");
          };
          read = () =>
            field.type === "array"
              ? JSON.parse(input.value)
              : field.type === "number"
                ? input.value === ""
                  ? Number.NaN
                  : Number(input.value)
                : input.value;
        }
        row.append(input);
      }
      write(value);
      const actions = node("div", "pp-actions");
      for (const [operation, label] of [
        ["write", "保存"],
        ["delete", "删除覆盖值"],
      ]) {
        const button = node("button", "", label);
        button.type = "button";
        button.onclick = async () => {
          if (saving) return;
          saving = true;
          back.disabled = true;
          view.querySelectorAll("button,input,select,textarea").forEach((input) => {
            input.disabled = true;
          });
          let success = false;
          try {
            if (operation === "delete") await client.remove(active, field.key);
            else {
              let value;
              try {
                value = read();
              } catch (error) {
                notify({ kind: "error", message: error.message });
                throw error;
              }
              await client.set(active, field.key, value);
            }
            success = true;
          } catch {
            /* 客户端已显示错误通知 / Client already displayed an error notification. */
          } finally {
            saving = false;
            back.disabled = window.history.length <= 1;
            view.querySelectorAll("button,input,select,textarea").forEach((input) => {
              input.disabled = false;
            });
            if (success && !destroyed) {
              // 只更新当前控件，保留其它尚未保存的输入。
              // Update this control without discarding other unsaved inputs.
              write(client.snapshot(active).values[field.key]);
            }
            if (!destroyed && pendingRoute) route();
          }
        };
        actions.append(button);
      }
      row.append(actions);
      view.append(row);
    }
    viewport.replaceChildren(view);
  }
  function route() {
    if (saving) {
      pendingRoute = true;
      return;
    }
    pendingRoute = false;
    if (active) client.leave(active);
    routedSearch = window.location.search;
    const modules = new URLSearchParams(routedSearch).getAll("module");
    if (modules.length !== 1 || !modules[0]) {
      generation++;
      active = null;
      heading.textContent = title;
      replace(node("p", "pp-error", "请在页面 URL 中提供一个 module 参数，格式为 ?module=模块标识。"), 1);
      return;
    }
    open(modules[0]);
  }
  const onPopState = () => {
    if (window.location.search !== routedSearch) route();
  };
  const onPageShow = (event) => {
    if (event.persisted) route();
  };
  back.onclick = () => {
    if (!saving) window.history.back();
  };
  window.addEventListener("popstate", onPopState);
  window.addEventListener("pageshow", onPageShow);
  route();
  return {
    destroy() {
      destroyed = true;
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
      generation++;
      if (active) client.leave(active);
      clearTimeout(timer);
      shell.remove();
    },
  };
}
