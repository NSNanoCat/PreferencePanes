import { createSettingsHandler, normalizeBoxJs } from "@nsnanocat/preference-panes";

const definition = normalizeBoxJs([], "Module");
void definition.storageKey;
const handler = createSettingsHandler({ origin: "https://example.org", loadConfig: async () => [] });
const response = await handler({ url: "https://example.org/api/Module/Settings/", method: "GET" });
const code: number | undefined = response?.status;
void code;
