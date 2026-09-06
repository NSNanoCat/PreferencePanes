import { createSettingsHandler, type SettingsField } from "@nsnanocat/settings";

const fields: SettingsField[] = [{ key: "mode", name: "Mode", type: "number", defaultValue: 1, options: [{ key: 1, label: "One" }] }];
const handler = createSettingsHandler({
  module: "Example",
  fields,
  storageKey: "@Example.Settings",
  endpoint: "https://example.org/settings/api",
});
const response = handler({ url: "https://example.org/settings/api", method: "HEAD" });
const status: number | undefined = response?.status;
void status;
// @ts-expect-error Boolean defaults must remain boolean.
const wrong: SettingsField = { key: "enabled", name: "Enabled", type: "boolean", defaultValue: "true" };
void wrong;
