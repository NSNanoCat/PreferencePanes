import type { BoxJSInput, ModuleDefinition, ModuleModel, SettingsField } from "@nsnanocat/preference-panes";
import { build } from "@nsnanocat/preference-panes";
import { mount, PreferencesView } from "@nsnanocat/preference-panes/browser";
import { ActionMenu, ModuleFrame, ModuleStatus, Navigation, probeModule } from "@nsnanocat/preference-panes/navigation";

const menu = new ActionMenu(id => frame.perform(id));
menu.update([{ id: "viewCaches", label: "查看缓存" }]);
menu.open();
menu.close();
menu.destroy();

const status = new ModuleStatus(document.createElement("span"));
await status.check("/api/Module", { json: "/configs/Module" });
const probe = await probeModule("/api/Module", { json: "/configs/Module" });
void probe.status;
status.destroy();

const frame = new ModuleFrame("/settings/Module", { headers: { "X-PreferencePanes-JSON": "/configs/Module" }, signal: new AbortController().signal });
document.body.append(frame.element);
await frame.load();
frame.back();
frame.destroy();

const navigation = new Navigation(document.body, document.createElement("main"), (_key, signal) => {
    void signal.aborted;
    return document.createElement("section");
});
navigation.open("detail");
navigation.back();
navigation.destroy();

const boxjs: BoxJSInput = { name: "Example", apps: [{ name: "App", settings: [{ id: "@Root.Module.Settings.flag", name: "Flag", type: "boolean", val: true }] }] };
const files: Record<string, string> = await build(boxjs);
await build(boxjs, "body { color: black; }");
void files;
const definition: ModuleDefinition = { module: "Module", storageKey: "Root", settingsPath: ["Module", "Settings"], fields: [] };
const model: ModuleModel = { module: "Module", boxjs, values: {}, configURL: "/configs/Module" };
mount(model).destroy();
mount(model, "body { color: black; }").destroy();
new PreferencesView(model).destroy();
// @ts-expect-error 页面不接受安装对象或元素配置 / Pages do not accept installation or element configuration.
mount({ element: document.body });
// @ts-expect-error 不接受样式 URL 列表配置 / Stylesheet URL-list configuration is not accepted.
mount(boxjs, { stylesheets: [] });
const field: SettingsField = { key: "Module.Settings.flag", name: "Flag", type: "boolean", defaultValue: false };
void field;
void definition;

// @ts-expect-error 安装映射不是 BoxJS 输入 / Installation mappings are not BoxJS input.
await build({ origin: "https://example.org", storageKey: "Root", module: "Module" });
// @ts-expect-error CSS 只接受正文字符串 / CSS accepts text strings only.
await build(boxjs, { stylesheets: ["https://example.org/theme.css"] });
// @ts-expect-error 不存在第三份配置 / There is no third configuration input.
await build(boxjs, "", { resources: [] });
