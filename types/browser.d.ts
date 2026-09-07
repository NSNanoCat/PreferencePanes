import type { ModuleDefinition, SettingsScalar } from "./index.js";
export interface Notification {
  kind: "success" | "error";
  operation: "write" | "delete";
  module: string;
  key: string;
  message?: string;
}
export interface PreferencesClientOptions {
  fetch?: typeof globalThis.fetch;
  notify?: (notification: Notification) => void;
  timeout?: number;
}
export interface ModuleSnapshot {
  definition: ModuleDefinition;
  values: Record<string, SettingsScalar | SettingsScalar[]>;
}
export interface PreferencesClient {
  probe(module: string): Promise<boolean>;
  open(module: string): Promise<ModuleSnapshot>;
  snapshot(module: string): ModuleSnapshot;
  leave(module: string): void;
  set(module: string, key: string, value: SettingsScalar | SettingsScalar[]): Promise<void>;
  remove(module: string, key: string): Promise<void>;
}
export interface PreferencesPanelOptions {
  element: HTMLElement;
  modules: { id: string; name?: string }[];
  title?: string;
  fetch?: typeof globalThis.fetch;
}
export function createPreferencesClient(options?: PreferencesClientOptions): PreferencesClient;
export function mountPreferencePanes(options: PreferencesPanelOptions): { destroy(): void };
