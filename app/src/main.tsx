import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./App";
import { LangProvider } from "./i18n";
import { initDesktopUpdater } from "./shell/desktopUpdater";

const root = document.getElementById("root");
if (!root) throw new Error("#root 不存在");

// 桌面壳里静默挂一次更新检查（网页端自动跳过）
initDesktopUpdater();

// 说明：未启用 StrictMode —— BlockNote 编辑器在开发模式的二次挂载下会重复初始化，
// 造成编辑器实例错乱。等编辑器接入稳定后再评估是否启用。
createRoot(root).render(
  <LangProvider>
    <App />
  </LangProvider>
);

// DEV 点验挂载：仅开发模式把 store 暴露给点验脚本（404 复现等），不进产物
if (import.meta.env.DEV) {
  import("./data/store").then(({ useStore }) => {
    (window as unknown as { __gf_store: typeof useStore }).__gf_store = useStore;
  });
}
