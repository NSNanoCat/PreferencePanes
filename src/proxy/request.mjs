import { runPreferences } from "./handler.mjs";

// 直接安装时读取宿主参数；站点生成的脚本使用同一执行入口并传入安装映射。
// Direct installs read host arguments; site-generated scripts call the same entry with a mapping.
runPreferences();
