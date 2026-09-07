import { createSettingsHandler, normalizeBoxJs } from "@nsnanocat/preference-panes";

const definition = normalizeBoxJs([], "Module");
void definition.storageKey;
const handler = createSettingsHandler({ origin: "https://example.org", loadConfig: async () => [] });
const response = await handler({ url: "https://example.org/api/Module/Settings/", method: "GET" });
const code: number | undefined = response?.status;
void code;

import { createPreferencesClient, mountPreferencePanes } from "@nsnanocat/preference-panes/browser";

const client = createPreferencesClient({
  notify: (event) => {
    const kind: "success" | "error" = event.kind;
    void kind;
  },
});
const snapshot = await client.open("Module");
void snapshot.definition.storageKey;
await client.set("Module", "Module.Settings.enabled", false);
mountPreferencePanes({ element: document.body, modules: [{ id: "Module" }] }).destroy();
