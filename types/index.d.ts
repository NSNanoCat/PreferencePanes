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
  /** POST: JSON {values:{...}}；DELETE: JSON {key:"path"} / Serialized update or deletion body. */
  body?: string;
}
export interface SettingsResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface SettingsHandlerOptions {
  module: string;
  fields: readonly SettingsField[];
  /** util 存储键或 @root.path / util key or @root.path. */
  storageKey: string;
  /** 精确匹配 origin/pathname / Exact origin/pathname match. */
  endpoint: string;
  /** 页面专用请求头，值为 1 / Dedicated header, value 1. */
  requestHeader?: string;
  /** 每次 GET 解析有效设置，默认读取持久化值；优先级由调用方决定。
   * Resolve effective settings per GET; defaults to persisted values. Caller owns precedence. */
  resolveSettings?: (stored: Record<string, unknown>) => Record<string, unknown>;
}
export function createSettingsHandler(options: SettingsHandlerOptions): (request: SettingsRequest) => SettingsResponse | undefined;
