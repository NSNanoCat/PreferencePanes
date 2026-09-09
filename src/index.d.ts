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
 * 由插件安装配置提供的固定存储映射，不接受浏览器指定存储根。
 * Fixed storage mapping provided by plugin installation, never a browser-selected root.
 */
export interface SettingsHandlerOptions {
    /**
     * 接管 /api/ 路径的 HTTPS 来源
     * HTTPS origin serving /api/ paths.
     */
    origin: string;
    /**
     * 顶层持久化键，不能使用 @ 路径语法
     * Literal top-level storage key, without @ path syntax.
     */
    storageKey: string;
    /**
     * /api/ 后允许访问的模块；独立通用模块可声明多个
     * Allowed module segments following /api/; a standalone installation can declare several.
     */
    module: string | string[];
    /**
     * 默认 X-Settings-Client，值必须为 1；不是认证凭据
     * Defaults to X-Settings-Client with value 1; not an authentication credential.
     */
    requestHeader?: string;
}
/**
 * 原生 Mock 的等价资源映射，支持不具备该语法的代理。
 * Equivalent resource mapping for proxies lacking native Mock syntax.
 */
export interface PreferencesHandlerOptions extends SettingsHandlerOptions {
    /**
     * 按 pathname 匹配，不匹配下载源自身
     * Match pathnames without intercepting the download source itself.
     */
    resources: Array<{
        /**
         * 锚定的 pathname 正则
         * Anchored pathname regular expression.
         */
        pattern: string;
        /**
         * HTTPS 下载源
         * HTTPS resource source.
         */
        source: string;
        /**
         * 响应媒体类型
         * Response media type.
         */
        contentType: string;
    }>;
}
/**
 * 通用安装入口；API 保持无网络读写，静态请求才下载资源。
 * Generic installation entry; APIs remain network-free and only static requests download resources.
 */
export class PreferencesHandler extends SettingsHandler {
    /**
     * 根据安装映射创建处理器，不立即下载资源。
     * Create a handler from the installation mapping without downloading resources.
     * @param options 安装 JSON 配置 / Installation JSON configuration.
     * @throws {TypeError} 存储映射、资源地址、正则或媒体类型无效 / Invalid storage mapping, resource URL, pattern or media type.
     */
    constructor(options: PreferencesHandlerOptions);
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
 * 将 BoxJS 字段数组、app 或订阅解析为模块定义，不执行脚本或 HTML。
 * Parse a BoxJS field array, app or subscription into a module definition without executing scripts or HTML.
 * @param config 外部 JSON 数据，在运行时校验 / External JSON validated at runtime.
 * @param module 请求路径中的模块标识 / Module identifier from the request path.
 * @returns 字段、公共路径与元数据 / Fields, common path and metadata.
 * @throws {TypeError} 配置格式、类型、路径或选项无效 / Invalid configuration shape, types, paths or options.
 */
export function normalizeBoxJs(config: unknown, module: string): ModuleDefinition;
/**
 * 使用 util 桥接指定模块的持久化存储，不下载或校验 BoxJS。
 * Bridge module persistence through util without downloading or validating BoxJS.
 */
export class SettingsHandler {
    /**
     * 创建实例，不发送请求或读取存储。
     * Construct an instance without network requests or storage reads.
     * @param options 来源、存储根与模块 / Origin, storage root and module.
     * @throws {TypeError} 来源、存储根、模块或头名称无效 / Invalid origin, storage root, module or header name.
     */
    constructor(options: SettingsHandlerOptions);
    /**
     * HEAD 不读存储；GET 返回任意指定值，POST/DELETE 对键或子树读改写一次。
     * HEAD avoids storage; GET returns any requested value, and POST/DELETE mutate a key or subtree in one read-modify-write.
     * @param request 代理请求 / Proxy request.
     * @returns HTTP 响应；非目标来源或非 API 路径返回 undefined / HTTP response, or undefined outside the configured API origin and path.
     * @throws {Error} 请求 URL 无效；存储失败以 HTTP 500 返回 / Invalid request URL; storage failures return HTTP 500.
     */
    handle(request: SettingsRequest): Promise<SettingsResponse | undefined>;
}
/**
 * 从完整 URL 解析 /api/ 后的 database 路径。
 * Parse database path segments following /api/ from an absolute URL.
 * @param url 完整请求地址 / Absolute request URL.
 * @returns 已解码的路径片段；非 API 路径返回 undefined / Decoded segments, or undefined for non-API paths.
 * @throws {TypeError} URL、编码或路径片段非法 / Invalid URL, encoding or path segment.
 */
export function parseSettingsPath(url: string): string[] | undefined;
