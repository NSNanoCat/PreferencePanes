import { createPreferencesClient } from "./client.mjs";

/**
 * 挂载从 BoxJS 实时生成的设置面板和短暂通知。
 * Mount runtime-generated BoxJS controls and transient notifications.
 * @param {import("./index.js").PreferencesPanelOptions} options 容器与请求；页面路径 /settings/{module} 对应配置 / Container and requests; /settings/{module} selects config.
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
    routedPath,
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
  const client = createPreferencesClient({ fetch, notify });
  function replace(view, direction) {
    const old = viewport.firstElementChild;
    viewport.replaceChildren(view);
    if (old && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
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
    heading.textContent = definition.metadata?.name || active;
    const view = node("section", "pp-fields");
    const growingInputs = [];
    const disableControls = (disabled) => {
      view.querySelectorAll("button,input,select,textarea").forEach((input) => {
        input.disabled = disabled;
      });
    };
    const metadata = definition.metadata;
    if (metadata) {
      const info = node("div", "pp-module-info");
      const iconURL = metadata.icon || metadata.icons?.[1] || metadata.icons?.[0];
      const resourceURL = (value) => {
        const url = new window.URL(value, window.location.href);
        if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Module metadata URLs must use HTTP or HTTPS");
        return url.href;
      };
      if (iconURL) {
        const image = node("img", "pp-module-icon");
        image.src = resourceURL(iconURL);
        image.alt = "";
        info.append(image);
      }
      const details = node("div", "pp-module-details");
      for (const description of [metadata.author, metadata.desc ?? metadata.description, ...(metadata.descs ?? [])])
        if (description) details.append(node("p", "pp-description", description));
      if (metadata.repo) {
        const link = node("a", "pp-module-source", "项目主页");
        link.href = resourceURL(metadata.repo);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        details.append(link);
      }
      info.append(details);
      view.append(info);
    }
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
          label.prepend(input);
          row.append(label);
          return { input, key: option.key };
        });
        read = () => inputs.filter((option) => option.input.checked).map((option) => option.key);
        write = (value) => {
          for (const option of inputs) option.input.checked = Array.isArray(value) && value.includes(option.key);
        };
      } else {
        const multiline = field.control === "textarea" || field.type === "array";
        const input = node(multiline ? "textarea" : "input", "pp-input");
        input.setAttribute("aria-label", field.name);
        if (field.placeholder) input.placeholder = field.placeholder;
        if (multiline && field.rows) input.rows = field.rows;
        const grow = () => {
          if (!multiline || !field.autoGrow || !input.isConnected) return;
          input.style.height = "auto";
          const baseline = input.getBoundingClientRect().height;
          const style = window.getComputedStyle(input);
          const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
          input.style.height = `${Math.max(baseline, input.scrollHeight + borders)}px`;
        };
        if (multiline && field.autoGrow) {
          input.addEventListener("input", grow);
          growingInputs.push(grow);
        }
        if (field.type === "boolean") {
          input.type = "checkbox";
          write = (value) => {
            input.checked = value === true;
          };
          read = () => input.checked;
        } else {
          if (!multiline) input.type = field.type === "number" ? "number" : "text";
          write = (value) => {
            input.value = field.type === "array" ? JSON.stringify(value ?? []) : (value ?? "");
            grow();
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
          disableControls(true);
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
            // 只更新当前控件，保留其它尚未保存的输入。
            // Update this control without discarding other unsaved inputs.
            if (!destroyed) write(client.snapshot(active).values[field.key]);
          } catch {
            /* 客户端已显示错误通知 / Client already displayed an error notification. */
          } finally {
            saving = false;
            back.disabled = window.history.length <= 1;
            disableControls(false);
            if (!destroyed && pendingRoute) route();
          }
        };
        actions.append(button);
      }
      row.append(actions);
      view.append(row);
    }
    viewport.replaceChildren(view);
    for (const grow of growingInputs) grow();
  }
  function route() {
    if (saving) {
      pendingRoute = true;
      return;
    }
    pendingRoute = false;
    if (active) client.leave(active);
    routedPath = window.location.pathname;
    const match = /^\/settings\/([a-zA-Z0-9_-]+)\/?$/.exec(routedPath);
    if (!match) {
      generation++;
      active = null;
      heading.textContent = title;
      replace(node("p", "pp-error", "页面地址应为 /settings/模块标识。"), 1);
      return;
    }
    open(match[1]);
  }
  const onPopState = () => {
    if (window.location.pathname !== routedPath) route();
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
