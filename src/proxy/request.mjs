import { $app } from "@nsnanocat/util/lib/app.mjs";
import { done } from "@nsnanocat/util/lib/done.mjs";
import { qs } from "@nsnanocat/util/polyfill/qs.mjs";
import { SettingsHandler } from "../SettingsHandler.mjs";

(async () => {
	let response;
	try {
		const { origin, configURL } = qs.parse(globalThis.$argument);
		const handler = new SettingsHandler({ origin, configURL });
		response = await handler.handle(globalThis.$request);
	} catch (error) {
		console.error(`PreferencePanes: ${error.message}`);
		response = {
			status: 500,
			headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
			body: globalThis.$request.method === "HEAD" ? "" : JSON.stringify({ error: "Settings execution failed" }),
		};
	}
	if (!response) {
		done({});
		return;
	}
	done($app === "Quantumult X" ? response : { response });
})();
