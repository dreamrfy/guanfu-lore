import { useEffect } from "react";
import { flushDocs, useStore } from "./data/store";
import { startAutoBackup } from "./data/backupAuto";
import { fontStackOf } from "./design/fonts";
import { useLang } from "./i18n";
import { AppShell } from "./shell/AppShell";

export function App() {
  const ready = useStore((s) => s.ready);
  const bootError = useStore((s) => s.bootError);
  const hydrate = useStore((s) => s.hydrate);
  const theme = useStore((s) => s.theme);
  const fontTheme = useStore((s) => s.fontTheme);
  const iconSet = useStore((s) => s.iconSet);
  const { lang, t } = useLang();

  // 窗口/标签页标题跟着语言走（《品牌与文案》§1：观复 / Lore）
  useEffect(() => {
    document.title = t("windowTitle");
  }, [lang, t]);

  // 主题 / 字体 / 图标风格挂在 <html> 上，样式统一走 CSS 变量
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 字体主题写进语义令牌 --gf-font-ui；旧变量 --font-family 由 tokens.css 映射到它
  useEffect(() => {
    document.documentElement.style.setProperty("--gf-font-ui", fontStackOf(fontTheme));
  }, [fontTheme]);

  useEffect(() => {
    document.documentElement.dataset.iconSet = iconSet;
  }, [iconSet]);

  // 启动：从本地数据库读出页面（空库则建第一篇）
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // 自动同步：定时把本地改动推上去、把云端改动拉下来（断网会自动退避重试）
  useEffect(() => {
    const start = useStore.getState().startAutoSync;
    const stop = useStore.getState().stopAutoSync;
    start();
    return () => stop();
  }, []);

  // 自动定时备份：到点把整库快照写进独立的备份库（启动 + 每小时心跳）
  useEffect(() => {
    startAutoBackup();
  }, []);

  // 剪藏离线队列：启动后消化上次失败的链接（服务可达时自动入库）
  useEffect(() => {
    const timer = setTimeout(() => {
      void import("./data/clipIngest").then(({ processOneQueuedClip }) =>
        import("./data/clipQueue").then(({ clipQueueProcess, clipQueueSize }) => {
          if (clipQueueSize() > 0) void clipQueueProcess((u) => processOneQueuedClip(u));
        }),
      );
    }, 5000); // 等自动同步/剪藏服务探活稳定后再试
    return () => clearTimeout(timer);
  }, []);

  // 关窗/刷新前，把防抖里还没落盘的正文写掉
  useEffect(() => {
    const onLeave = () => {
      void flushDocs();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // 窄窗口下右栏是浮层，会把正文盖住 —— 这时先自动收起（不写进偏好，宽屏下仍按你的设置来）
  useEffect(() => {
    const apply = () => {
      if (window.innerWidth < 1000 && useStore.getState().rightPanelOpen) {
        useStore.getState().setRightPanelOpen(false, false);
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  if (!ready) {
    return <div className="boot">{t("bootLoading")}</div>;
  }

  if (bootError) {
    return (
      <div className="boot boot--error">
        <div>
          <div style={{ fontSize: 15, marginBottom: 8 }}>{t("bootErrorTitle")}</div>
          <div style={{ marginBottom: 12 }}>
            {t("bootErrorBody")}
            <div style={{ marginTop: 6, opacity: 0.7 }}>{bootError}</div>
          </div>
          <button className="icon-btn" onClick={() => window.location.reload()}>
            {t("bootReload")}
          </button>
        </div>
      </div>
    );
  }

  return <AppShell />;
}
