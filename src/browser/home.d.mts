import type { ActionMenu, MenuAction, Notice } from "./Navigation.mjs";

/** 宿主导航状态 / Bridge navigation state. */
export interface HomeState {
    /** 当前标题 / Current title. */
    title: string;
    /** 可用菜单操作 / Available menu actions. */
    actions: MenuAction[];
    /** 操作是否正在执行 / Whether an operation is in progress. */
    busy: boolean;
    /** 联合历史是否可返回 / Whether joint history can go back. */
    canGoBack: boolean;
}
/** 宿主初始化输入 / Bridge initialization inputs. */
export interface BridgeOptions {
    /** 共用操作菜单 / Shared action menu. */
    menu: ActionMenu;
    /** 沿当前页面历史返回 / Go back through the current page history. */
    back(): void;
}
/** 可选 Bridge 模块提供的宿主能力 / Host capabilities supplied by the optional Bridge module. */
export interface Bridge {
    /** 同步当前导航状态 / Synchronize current navigation state. */
    update(state: HomeState): void | Promise<void>;
    /** 返回确认或取消选择 / Return the confirmation or cancellation choice. */
    confirm(message: string): boolean | Promise<boolean>;
    /** 显示操作结果 / Display an operation result. */
    notice(detail: Notice): void;
    /** 打开完整地址；_blank 保留当前页面，_self 替换当前页面 / Open an absolute URL; _blank retains the current page and _self replaces it. */
    openURL(url: string, target?: "_self" | "_blank"): void | Promise<void>;
    /** 释放界面与监听器 / Release UI and listeners. */
    destroy(): void;
}
/** 宿主工厂；默认导出 / Bridge factory; the override's default export. */
export type BridgeFactory = (options: BridgeOptions) => Bridge | Promise<Bridge>;
/**
 * 初始化固定路径的 JSON 首页及可选 Bridge。
 * Initialize the JSON homepage and optional Bridge at fixed paths.
 * @returns 退出清理动作；失败显示错误并拒绝 / Cleanup action; failures display an error and reject.
 */
export function startHome(): Promise<() => void>;
/** 首页入口图标 / Homepage entry icon. */
export type HomeIcon = { src: string; text?: never } | { text: string; src?: never };
/** 外链打开方式：带导航的内部框架、当前页面或新页面 / Link opening mode: an internal frame with navigation, the current page or a new page. */
export type HomeLinkTarget = "internal" | "_self" | "_blank";
/** 首页模块或链接入口 / Homepage module or link entry. */
export type HomeItem = { name: string; icon: HomeIcon; description?: string } & ({ module: string; pageModule?: string; href?: never; target?: never } | { href: string; target?: HomeLinkTarget; module?: never; pageModule?: never });
/** 运行时导入的首页配置 / Runtime-imported homepage configuration. */
export interface HomeConfig {
    title: string;
    logo?: string;
    sections: { title: string; layout?: "grid" | "list"; items: HomeItem[] }[];
    footer?: string[];
}
