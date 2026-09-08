import { normalizeBoxJs, SettingsHandler } from "@nsnanocat/preference-panes";

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
