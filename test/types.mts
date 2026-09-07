import { createSettingsHandler, parseSettingsPath, type SettingsField } from "@nsnanocat/preference-panes";

const fields: SettingsField[] = [{ key: "Enhanced.Settings.Home.Top_left", name: "Top left", type: "string", defaultValue: "mine" }];
const handler = createSettingsHandler({ origin: "https://example.org", storageKey: "BiliBili", fields });
handler({ url: "https://example.org/api/Enhanced/Settings/Home/Top_left", method: "POST", body: '"mine"' });
const parts: string[] | undefined = parseSettingsPath("https://example.org/api/a/b");
void parts;
// @ts-expect-error Boolean defaults are not strings.
const bad: SettingsField = { key: "enabled", name: "Enabled", type: "boolean", defaultValue: "true" };
void bad;
