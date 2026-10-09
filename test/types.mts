// @ts-expect-error ModuleModel is no longer public.
import type { BoxJSInput, ModuleDefinition, ModuleModel, SettingsField } from "@nsnanocat/preference-panes";
// @ts-expect-error build is no longer public.
import { build } from "@nsnanocat/preference-panes";
import type { BridgeFactory, HomeConfig } from "@nsnanocat/preference-panes/browser";
// @ts-expect-error PreferencesView is an internal implementation detail.
import { mount, PreferencesView } from "@nsnanocat/preference-panes/browser";
import { ActionMenu, ModuleFrame, ModuleStatus, Navigation, probeModule } from "@nsnanocat/preference-panes/navigation";

const factory: BridgeFactory = async ({ menu, back }) => ({
    update(state) {
        menu.update(state.actions, state.busy);
    },
    confirm: message => window.confirm(message),
    notice(detail) {
        void detail.message;
    },
    openURL(url) {
        window.location.assign(url);
    },
    destroy() {
        void back;
    },
});
void factory;
const home: HomeConfig = {
    title: "Example",
    sections: [
        {
            title: "项目链接",
            items: [
                { name: "官网", icon: { text: "🏠" }, href: "/", target: "internal" },
                { name: "组织", icon: { text: "🐙" }, href: "https://github.com/Example", target: "_blank" },
                { name: "当前页", icon: { text: "↗" }, href: "/guide/", target: "_self" },
            ],
        },
    ],
};
void home;

const menu = new ActionMenu(id => frame.perform(id));
menu.update([{ id: "viewCaches", label: "查看缓存" }]);
menu.open();
menu.close();
menu.destroy();

const status = new ModuleStatus(document.createElement("span"));
await status.check("/api/Module");
const probe = await probeModule("/api/Module");
void probe.status;
status.destroy();

const frame = new ModuleFrame("/settings/Module", { signal: new AbortController().signal, headers: { "X-PreferencePanes-JSON": "/configs/Module.json", "X-PreferencePanes-CSS": "/theme.css" } });
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
mount(boxjs).destroy();
// @ts-expect-error mount accepts exactly one BoxJS argument.
mount(boxjs, "body { color: black; }");
// @ts-expect-error API models are not valid BoxJS input.
mount({ module: "Module", boxjs, values: {} });
const definition: ModuleDefinition = { module: "Module", storageKey: "Root", settingsPath: ["Module", "Settings"], fields: [] };
const field: SettingsField = { key: "Module.Settings.flag", name: "Flag", type: "boolean", defaultValue: false };
void field;
void definition;
void build;
void PreferencesView;
void (null as ModuleModel | null);
