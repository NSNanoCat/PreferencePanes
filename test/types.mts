import type { SettingsField, SettingsHandlerOptions } from "@nsnanocat/preference-panes";
import { normalizeBoxJs, PreferencesHandler, SettingsHandler } from "@nsnanocat/preference-panes";
import type { ModuleSnapshot, Notification, PreferencesPanel } from "@nsnanocat/preference-panes/browser";

const definition = normalizeBoxJs([], "Module");
void definition.storageKey;
const handler = new SettingsHandler({ origin: "https://example.org", storageKey: "Root", module: "Module" });
new SettingsHandler({ origin: "https://example.org", storageKey: "Root", module: ["Module", "Other"] });
const response = await handler.handle({ url: "https://example.org/api/Module/Settings/", method: "GET" });
const code: number | undefined = response?.status;
void code;

import { createPreferencesClient, mountPreferencePanes } from "@nsnanocat/preference-panes/browser";

const client = createPreferencesClient({
	notify: event => {
		const kind: "success" | "error" = event.kind;
		void kind;
	},
});
const snapshot = await client.open("Module");
const nullableSnapshot: ModuleSnapshot = { ...snapshot, values: { "Module.Settings.notes": null } };
void nullableSnapshot;
void snapshot.definition.storageKey;
await client.set("Module", "Module.Settings.enabled", false);
mountPreferencePanes({ element: document.body }).destroy();

// 前端保留字段约束，代理仅接收安装时的存储映射。
// Fields stay constrained in the frontend; the proxy receives only an installed storage mapping.
const options: SettingsHandlerOptions = { origin: "https://example.org", storageKey: "Root", module: "Module" };
void options;
const resourceHandler: SettingsHandler = new PreferencesHandler({ ...options, resources: [{ pattern: "^/configs/Module$", source: "https://example.org/assets/module.json", contentType: "application/json" }] });
await resourceHandler.handle({ url: "https://example.org/configs/Module", method: "HEAD" });
const field: SettingsField = { key: "Module.Settings.notes", name: "Notes", type: "string", control: "textarea", rows: 3, autoGrow: true, placeholder: "Notes", defaultValue: "" };
void field;
const panel: PreferencesPanel = mountPreferencePanes({ element: document.body });
panel.destroy();
const event: Notification = { kind: "success", operation: "delete", module: "Module", key: "Module.Settings.notes" };
void event;
await client.remove("Module", "Module.Settings.notes");
client.leave("Module");
await client.readCaches("Module");
await client.clearCaches("Module");
await client.reset("Module");

// @ts-expect-error 布尔字段不能使用字符串默认值 / Boolean fields cannot have string defaults.
const invalidDefault: SettingsField = { key: "Module.Settings.enabled", name: "Enabled", type: "boolean", defaultValue: "true" };
void invalidDefault;
// @ts-expect-error 不接受对象作为叶子值 / Objects are not accepted as leaf values.
await client.set("Module", "Module.Settings.notes", { notes: "text" });
// @ts-expect-error 安装时必须提供存储根和模块 / Installation requires a storage root and module.
new SettingsHandler({ origin: "https://example.org" });
