import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

/**
 * 页签栏（手册 §1）：横贯整窗，高 38px。
 * 左区导航钮区宽 228（=侧栏宽，视觉连体；按钮 W12 落位），
 * 页签固定 180×38，关闭钮 20×20 常显，新建钮 28×28，
 * 右端窗口控制三钮 46×38（Tauri decorations:false 自绘标题栏，W11）。
 */

type TauriWindow = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
};

function tauriWindow(): TauriWindow | null {
  const t = (window as unknown as { __TAURI__?: { window?: { getCurrentWindow?: () => TauriWindow } } })
    .__TAURI__;
  return t?.window?.getCurrentWindow?.() ?? null;
}

function winOp(op: "minimize" | "toggleMaximize" | "close") {
  const w = tauriWindow();
  if (!w) return; // 浏览器 dev 无 Tauri 运行时，降级 no-op
  void w[op]().catch(() => {});
}

function WinGlyph({ kind }: { kind: "min" | "max" | "close" }) {
  const stroke = "currentColor";
  if (kind === "min")
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M0 5 H10" stroke={stroke} strokeWidth="1" />
      </svg>
    );
  if (kind === "max")
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke={stroke} strokeWidth="1" />
      </svg>
    );
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M0 0 L10 10 M10 0 L0 10" stroke={stroke} strokeWidth="1" />
    </svg>
  );
}

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const pages = useStore((s) => s.pages);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const createPage = useStore((s) => s.createPage);
  const iconSet = useStore((s) => s.iconSet);

  return (
    <div className="tabbar">
      <div className="tabbar__nav" />
      <div className="tabbar__tabs">
        {tabs.map((id) => {
          const page = pages.find((p) => p.id === id);
          if (!page) return null;
          return (
            <div
              key={id}
              className={`tab${id === activeTabId ? " tab--active" : ""}`}
              onClick={() => setActiveTab(id)}
              title={page.title}
            >
              {page.icon && <span className="tab__icon">{page.icon}</span>}
              <span className="tab__label">{page.title || "无标题"}</span>
              <span
                className="tab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(id);
                }}
                title="关闭页签"
              >
                <AppIcon name="close" set={iconSet} size={13} />
              </span>
            </div>
          );
        })}
        <div className="tabbar__new" title="新建页面" onClick={() => createPage(null)}>
          <AppIcon name="plus" set={iconSet} size={14} />
        </div>
      </div>
      <div className="tabbar__win">
        <button className="winbtn" title="最小化" onClick={() => winOp("minimize")}>
          <WinGlyph kind="min" />
        </button>
        <button className="winbtn" title="最大化" onClick={() => winOp("toggleMaximize")}>
          <WinGlyph kind="max" />
        </button>
        <button className="winbtn winbtn--close" title="关闭" onClick={() => winOp("close")}>
          <WinGlyph kind="close" />
        </button>
      </div>
    </div>
  );
}
