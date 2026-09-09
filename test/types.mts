import type { BoxJSInput, ModuleDefinition, SettingsField } from "@nsnanocat/preference-panes";
import { build } from "@nsnanocat/preference-panes";

const boxjs: BoxJSInput = { name: "Example", apps: [{ name: "App", settings: [{ id: "@Root.Module.Settings.flag", name: "Flag", type: "boolean", val: true }] }] };
const files: Record<string, string> = await build(boxjs);
await build(boxjs, "body { color: black; }");
void files;
const field: SettingsField = { key: "Module.Settings.flag", name: "Flag", type: "boolean", defaultValue: false };
void field;
const definition: ModuleDefinition = { module: "Module", storageKey: "Root", settingsPath: ["Module", "Settings"], fields: [] };
void definition;

// @ts-expect-error 安装映射不是 BoxJS 输入 / Installation mappings are not BoxJS input.
await build({ origin: "https://example.org", storageKey: "Root", module: "Module" });
// @ts-expect-error CSS 只接受正文字符串 / CSS accepts text strings only.
await build(boxjs, { stylesheets: ["https://example.org/theme.css"] });
// @ts-expect-error 不存在第三份配置 / There is no third configuration input.
await build(boxjs, "", { resources: [] });
