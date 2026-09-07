import { createPreferencesClient } from "./client.mjs";

/**
 * 挂载从 BoxJS 实时生成的设置面板和短暂通知。
 * Mount runtime-generated BoxJS controls and transient notifications.
 * @param {import("../types/browser.js").PreferencesPanelOptions} options 容器、模块目录与请求 / Container, module directory and requests.
 * @returns {{destroy(): void}} 清理接口 / Cleanup handle.
 */
export function mountPreferencePanes({ element: root, modules, fetch, title = "Preferences" }) {
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
    generation = 0,
    active = null,
    saving = false,
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
  function home() {
    const version = ++generation;
    if (active) client.leave(active);
    active = null;
    back.hidden = true;
    heading.textContent = title;
    const view = node("section", "pp-home");
    for (const module of modules) {
      const button = node("button", "pp-module", module.name ?? module.id);
      button.type = "button";
      button.disabled = true;
      const status = node("span", "pp-module-status", "检测中");
      button.append(status);
      view.append(button);
      button.onclick = () => {
        window.location.hash = encodeURIComponent(module.id);
      };
      client.probe(module.id).then((available) => {
        if (version !== generation) return;
        button.disabled = !available;
        status.textContent = available ? "" : "未启用";
      });
    }
    replace(view, -1);
  }
  async function open(module) {
    const version = ++generation;
    active = module.id;
    back.hidden = false;
    heading.textContent = module.name ?? module.id;
    replace(node("p", "pp-loading", "读取设置…"), 1);
    try {
      await client.open(module.id);
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
            back.disabled = false;
            view.querySelectorAll("button,input,select,textarea").forEach((input) => {
              input.disabled = false;
            });
            if (success && !destroyed) {
              // 只更新当前控件，保留其它尚未保存的输入。
              // Update this control without discarding other unsaved inputs.
              write(client.snapshot(active).values[field.key]);
            }
            if (!destroyed && window.location.hash.slice(1) !== encodeURIComponent(active)) route();
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
    if (saving) return;
    const module = modules.find((module) => encodeURIComponent(module.id) === window.location.hash.slice(1));
    if (module) {
      if (active) client.leave(active);
      open(module);
    } else home();
  }
  back.onclick = () => {
    if (!saving) window.location.hash = "";
  };
  window.addEventListener("hashchange", route);
  route();
  return {
    destroy() {
      destroyed = true;
      window.removeEventListener("hashchange", route);
      generation++;
      if (active) client.leave(active);
      clearTimeout(timer);
      shell.remove();
    },
  };
}
