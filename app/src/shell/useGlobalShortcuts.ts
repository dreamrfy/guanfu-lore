/**
 * 全局快捷键注册（W84 · 手册 §12）
 *
 * 装在 AppShell 里，组件挂载时注册、卸载时注销。
 * 规格：13-总纲-重做施工手册.md §12
 */
import { useEffect } from "react";
import { installGlobalShortcuts, registerShortcut } from "../data/shortcuts";
import { useStore } from "../data/store";
import { openSearchOverlay } from "./SearchOverlay";

export function useGlobalShortcuts() {
  useEffect(() => {
    installGlobalShortcuts();

    // Ctrl+P · 全局搜索（快速查找）
    const offSearch = registerShortcut("Ctrl+P", (e) => {
      e.preventDefault();
      openSearchOverlay();
    });

    // Ctrl+\ · 侧栏折叠/展开
    const offSidebar = registerShortcut("Ctrl+\\", (e) => {
      e.preventDefault();
      useStore.getState().toggleSidebar();
    });

    // Ctrl+T · 新建页签（FlowUs 标题提示 ⌘T，Windows 键未实测，这里按最接近的语义落地）
    const offNewTab = registerShortcut("Ctrl+T", (e) => {
      e.preventDefault();
      void useStore.getState().createPage(null);
    });

    return () => {
      offSearch();
      offSidebar();
      offNewTab();
    };
  }, []);
}
