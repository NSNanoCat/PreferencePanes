import type { SettingsField, SettingsHandlerOptions, SettingsResolver } from "@nsnanocat/preference-panes";
import { normalizeBoxJs, SettingsHandler } from "@nsnanocat/preference-panes";
import type { Notification, PreferencesPanel } from "@nsnanocat/preference-panes/browser";

const definition = normalizeBoxJs([], "Module");
void definition.storageKey;
const handler = new SettingsHandler({ origin: "https://example.org", configURL: "https://assets.example.org/Module.boxjs.json" });
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
void snapshot.definition.storageKey;
await client.set("Module", "Module.Settings.enabled", false);
mountPreferencePanes({ element: document.body }).destroy();

// 公开声明保留字段类型约束和同步 resolver 契约。
// Public declarations preserve field-type constraints and the synchronous resolver contract.
const resolver: SettingsResolver = stored => stored;
const options: SettingsHandlerOptions = { origin: "https://example.org", configURL: "https://example.org/config.json", resolveSettings: resolver };
void options;
const field: SettingsField = { key: "Module.Settings.notes", name: "Notes", type: "string", control: "textarea", rows: 3, autoGrow: true, placeholder: "Notes", defaultValue: "" };
void field;
const panel: PreferencesPanel = mountPreferencePanes({ element: document.body });
panel.destroy();
const event: Notification = { kind: "success", operation: "delete", module: "Module", key: "Module.Settings.notes" };
void event;
await client.remove("Module", "Module.Settings.notes");
client.leave("Module");

// @ts-expect-error 布尔字段不能使用字符串默认值 / Boolean fields cannot have string defaults.
const invalidDefault: SettingsField = { key: "Module.Settings.enabled", name: "Enabled", type: "boolean", defaultValue: "true" };
void invalidDefault;
// @ts-expect-error resolver 必须同步 / Resolvers must be synchronous.
const asyncResolver: SettingsResolver = async stored => stored;
void asyncResolver;
// @ts-expect-error 不接受对象作为叶子值 / Objects are not accepted as leaf values.
await client.set("Module", "Module.Settings.notes", { notes: "text" });
// @ts-expect-error configURL 为必填参数 / configURL is required.
new SettingsHandler({ origin: "https://example.org" });
