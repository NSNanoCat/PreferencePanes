/**
 * 设置允许的标量值，不包含 null 或对象。
 * Supported setting scalars, excluding null and objects.
 */
export type SettingsScalar = string | number | boolean;
/**
 * 单个选择项的存储值与显示标签。
 * Stored value and display label of a choice.
 */
export interface SettingsOption<T extends SettingsScalar = SettingsScalar> {
    /**
     * 持久化值，保留原始标量类型
     * Persisted value with its original scalar type.
     */
    key: T;
    /**
     * 纯文本选项名称
     * Plain-text option label.
     */
    label: string;
}
/**
 * 控件共同的路径与展示属性。
 * Shared path and presentation attributes of a control.
 */
interface FieldBase {
    /**
     * 不含存储根的点分路径，例如 Module.Settings.key
     * Dotted path without the storage root, such as Module.Settings.key.
     */
    key: string;
    /**
     * 纯文本标题
     * Plain-text title.
     */
    name: string;
    /**
     * 纯文本说明
     * Plain-text description.
     */
    description?: string;
    /**
     * 原始 BoxJS 控件类型，与持久化值类型区分
     * Original BoxJS control kind, separate from the stored value type.
     */
    control?: "boolean" | "checkboxes" | "selects" | "text" | "textarea" | "number";
    /**
     * 输入占位文字
     * Input placeholder.
     */
    placeholder?: string;
    /**
     * 多行控件的基础行数，必须为正整数
     * Positive baseline row count for a textarea.
     */
    rows?: number;
    /**
     * 是否随多行内容自动调整高度
     * Whether textarea height follows its contents.
     */
    autoGrow?: boolean;
}
/**
 * 归一化字段；默认值和选项必须符合对应 type，缺失默认值保持缺失。
 * Normalized field; defaults and choices match type, and absent defaults stay absent.
 */
export type SettingsField = FieldBase &
    (
        | { type: "boolean"; defaultValue?: boolean; options?: SettingsOption<boolean>[] }
        | { type: "number"; defaultValue?: number; options?: SettingsOption<number>[] }
        | { type: "string"; defaultValue?: string; options?: SettingsOption<string>[] }
        | { type: "array"; defaultValue?: SettingsScalar[]; options?: SettingsOption[] }
    );
/**
 * 代理宿主提供的请求；保留字符串方法以便拒绝不支持的方法。
 * Request provided by the proxy host; string methods allow unsupported methods to be rejected.
 */
export interface SettingsRequest {
    /**
     * 请求的完整 URL
     * Absolute request URL.
     */
    url: string;
    /**
     * 区分大小写的 HTTP 方法
     * Case-sensitive HTTP method.
     */
    method: string;
    /**
     * 头名称在处理器中统一转为小写
     * Header names are normalized to lowercase by the handler.
     */
    headers?: Record<string, string | undefined>;
    /**
     * POST 的正文为 JSON 值本身；DELETE 无正文
     * POST contains the JSON value itself; DELETE has no body.
     */
    body?: string;
}
/**
 * 通用 HTTP 响应，调用方负责转换为代理宿主的 done 格式。
 * Generic HTTP response; the caller adapts it to the host's done format.
 */
export interface SettingsResponse {
    /**
     * 数字状态码
     * Numeric status code.
     */
    status: number;
    /**
     * 响应头
     * Response headers.
     */
    headers: Record<string, string>;
    /**
     * JSON 文本；HEAD 始终为空字符串
     * JSON text; always an empty string for HEAD.
     */
    body: string;
}
/**
 * 属于单个模块的字段、存储根及可选展示元数据。
 * Fields, storage root and optional display metadata belonging to one module.
 */
export interface ModuleDefinition {
    /**
     * 字段 ID 的模块段，不能由 app 名称推断
     * Module segment from field IDs, never inferred from app names.
     */
    module: string;
    /**
     * 由 @root.module.path 中的 root 提取
     * Root extracted from @root.module.path.
     */
    storageKey: string;
    /**
     * 保留配置文件中的字段顺序
     * Fields in configuration order.
     */
    fields: SettingsField[];
    /**
     * 含模块名的公共父路径片段
     * Common parent path segments including the module name.
     */
    settingsPath: string[];
    /**
     * 只有字段来自唯一 app 时提供
     * Present only when all fields belong to one app.
     */
    metadata?: {
        /**
         * 应用标识，仅用于展示或溯源
         * App identifier for display or provenance only.
         */
        id?: string;
        /**
         * 显示名称
         * Display name.
         */
        name?: string;
        /**
         * 作者纯文本
         * Plain-text author.
         */
        author?: string;
        /**
         * 项目地址；页面仅接受 HTTP(S) 或相对链接
         * Project address; the page accepts only HTTP(S) or relative URLs.
         */
        repo?: string;
        /**
         * 仅保留来源信息，不执行脚本
         * Source metadata only; never executed.
         */
        script?: string;
        /**
         * 优先使用的显式图标地址
         * Explicit preferred icon URL.
         */
        icon?: string;
        /**
         * 原版透明/彩色顺序，不是亮暗顺序
         * Original transparent/color order, not light/dark order.
         */
        icons?: string[];
        /**
         * 多段纯文本说明
         * Multiple plain-text paragraphs.
         */
        descs?: string[];
        /**
         * desc 未提供时的说明
         * Description used when desc is absent.
         */
        description?: string;
        /**
         * 优先使用的纯文本说明
         * Preferred plain-text description.
         */
        desc?: string;
    };
}
/**
 * 可序列化的 JSON 值。
 * Serializable JSON value.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
/**
 * 标准 BoxJS 展示元数据。
 * Standard BoxJS presentation metadata.
 */
export type BoxJSMetadata = NonNullable<ModuleDefinition["metadata"]>;
/**
 * 标准 BoxJS 设置项，由浏览器解析控件语义。
 * Standard BoxJS setting interpreted by the browser.
 */
export interface BoxJSSetting {
    /**
     * 字段存储 ID
     * Field storage ID.
     */
    id: string;
    /**
     * 显示名称
     * Display name.
     */
    name: string;
    /**
     * BoxJS 控件类型
     * BoxJS control type.
     */
    type: string;
    /**
     * 默认 JSON 值
     * Default JSON value.
     */
    val?: JsonValue;
    /**
     * 标准扩展属性
     * Standard extension properties.
     */
    [key: string]: unknown;
}
/**
 * 单个 BoxJS 应用。
 * A BoxJS application.
 */
export interface BoxJSApp extends BoxJSMetadata {
    /**
     * 应用设置
     * Application settings.
     */
    settings: BoxJSSetting[];
}
/**
 * BoxJS 订阅。
 * A BoxJS subscription.
 */
export interface BoxJSSubscription extends BoxJSMetadata {
    /**
     * 应用列表
     * Application list.
     */
    apps: BoxJSApp[];
}
/**
 * 唯一的数据配置输入。
 * The sole data configuration input.
 */
export type BoxJSInput = BoxJSSetting[] | BoxJSApp | BoxJSSubscription;
/**
 * 生成具体模块的页面、代理和配置 Mock，不生成项目入口页。
 * Build a concrete module's page, proxy and config Mock without a project landing page.
 * @param boxjs 恰好包含一个模块的 BoxJS JSON / BoxJS JSON describing exactly one module.
 * @param css 可选 CSS 正文 / Optional CSS text.
 * @returns 相对路径到文件内容的映射 / Relative paths mapped to file contents.
 */
export function build(boxjs: BoxJSInput, css?: string): Promise<Record<string, string>>;
