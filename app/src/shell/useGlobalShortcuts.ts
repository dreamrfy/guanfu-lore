/**
 * 全局快捷键注册（W84 · 手册 §12）
 *
 * 装在 AppShell 里，组件挂载时注册、卸载时注销。
 * 规格：13-总纲-重做施工手册.md §12
 */
import { useEffect } from "react";
import { comboOf, installGlobalShortcuts, isEditingText, registerShortcut } from "../data/shortcuts";
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

    // Ctrl+Shift+V · 快速剪藏（27 号 §3.3 桌面入口）
    // 浏览器会把 Ctrl+Shift+V 当“粘贴为纯文本”，冒泡阶段 defaultPrevented 已为 true；
    // 所以在捕获阶段拦，且文本编辑中直接放行（保留系统粘贴）。
    const onClipKey = (e: KeyboardEvent) => {
      if (isEditingText(e.target)) return;
      const combo = comboOf(e);
      // Chrome/WebView2 会把 Ctrl+Shift+V 吞成“粘贴为纯文本”，真实按键到不了页面；
      // 保留它给 Tauri，同时给桌面浏览器一个可用的 Ctrl+Alt+V。
      if (combo !== "Ctrl+Shift+V" && combo !== "Ctrl+Alt+V") return;
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new Event("gf:open-clip-dialog"));
    };
    window.addEventListener("keydown", onClipKey, true);

    return () => {
      offSearch();
      offSidebar();
      offNewTab();
      window.removeEventListener("keydown", onClipKey, true);
    };
  }, []);
}
