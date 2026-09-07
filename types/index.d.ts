/** 字段标量 / Setting scalar. */
export type SettingsScalar = string | number | boolean;
export interface SettingsOption<T extends SettingsScalar = SettingsScalar> {
  key: T;
  label: string;
}
interface FieldBase {
  key: string;
  name: string;
  description?: string;
}
/** 对齐 argument 配置字段 / Argument-compatible field. */
export type SettingsField = FieldBase &
  (
    | { type: "boolean"; defaultValue?: boolean; options?: SettingsOption<boolean>[] }
    | { type: "number"; defaultValue?: number; options?: SettingsOption<number>[] }
    | { type: "string"; defaultValue?: string; options?: SettingsOption<string>[] }
    | { type: "array"; defaultValue?: SettingsScalar[]; options?: SettingsOption[] }
  );
export interface SettingsRequest {
  url: string;
  method: string;
  headers?: Record<string, string | undefined>;
  /** POST 的正文为 JSON 值本身；DELETE 无正文 / POST contains the JSON value itself; DELETE has no body. */
  body?: string;
}
export interface SettingsResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface SettingsHandlerOptions {
  /** 接管 /api/ 路径的 HTTPS 来源 / HTTPS origin serving /api/ paths. */
  origin: string;
  /** 运行时加载 BoxJS JSON / Load BoxJS JSON at runtime. */
  loadConfig: (module: string) => unknown | Promise<unknown>;
  /** 页面专用请求头，值为 1 / Dedicated header, value 1. */
  requestHeader?: string;
  /** 每次 GET 解析有效设置，默认读取持久化值；优先级由调用方决定。
   * Resolve effective settings per GET; defaults to persisted values. Caller owns precedence. */
  resolveSettings?: (stored: Record<string, unknown>, definition: ModuleDefinition) => Record<string, unknown>;
}
export interface ModuleDefinition {
  module: string;
  storageKey: string;
  fields: SettingsField[];
  settingsPath: string[];
}
export function normalizeBoxJs(config: unknown, module: string): ModuleDefinition;
export function createSettingsHandler(options: SettingsHandlerOptions): (request: SettingsRequest) => Promise<SettingsResponse | undefined>;
/** 解析 /api/ 后的 database 路径；非法路径抛错 / Parse database path after /api/; throws on unsafe paths. */
export function parseSettingsPath(url: string): string[] | undefined;
