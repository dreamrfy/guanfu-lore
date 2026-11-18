import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { savePrefs } from "../data/store";
import { useNavHistory } from "../data/navHistory";
import { AppIcon } from "../design/icons";

/**
 * 页签栏（手册 §1）：横贯整窗，高 38px。
 * 左区导航钮区宽 228（=侧栏宽，视觉连体）：后退/前进 32×26 @(8,6)/(42,6) 无历史 disabled，
 * 主页/刷新 32×32 @(82,3)/(122,3)（W12）；
 * 页签固定 180×38（favicon 16、标题 120×20、关闭 20×20 常显、新建 28×28，W13）；
 * 页签右键菜单 8 项 + 边界灰置（W14；第 8 项观测未取到 → 【暂定】观复自有「关闭标签页」）；
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

/** 在锚点页签的左/右插入一个新页签（新建页由 createPage 落库，这里只调位次） */
function insertNewTabAt(anchorId: string, side: "left" | "right") {
  void useStore.getState().createPage(null).then((id) => {
    const cur = useStore.getState().tabs.filter((t) => t !== id);
    const i = cur.indexOf(anchorId);
    cur.splice(side === "left" ? i : i + 1, 0, id);
    useStore.setState({ tabs: cur });
    savePrefs({ tabs: cur });
    void useStore.getState().ensureDoc(id);
  });
}

/** 关闭锚点页签左侧/右侧/其他的所有页签（永远保留锚点页签） */
function closeSideOf(anchorId: string, side: "left" | "right" | "other") {
  const st = useStore.getState();
  const i = st.tabs.indexOf(anchorId);
  const keep =
    side === "left" ? st.tabs.slice(i) : side === "right" ? st.tabs.slice(0, i + 1) : [anchorId];
  const activeTabId = st.activeTabId && keep.includes(st.activeTabId) ? st.activeTabId : anchorId;
  useStore.setState({ tabs: keep, activeTabId });
  savePrefs({ tabs: keep, activeTabId });
  void useStore.getState().ensureDoc(activeTabId);
}

/** 复制页签网址【暂定】：构造 ?page=<id> 深链（深链读取在路由批次接线） */
function copyTabUrl(tabId: string) {
  void navigator.clipboard.writeText(`${location.origin}/?page=${tabId}`).catch(() => {});
}

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const pages = useStore((s) => s.pages);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const createPage = useStore((s) => s.createPage);
  const iconSet = useStore((s) => s.iconSet);

  const canBack = useNavHistory((s) => s.canBack());
  const canForward = useNavHistory((s) => s.canForward());
  const back = useNavHistory((s) => s.back);
  const forward = useNavHistory((s) => s.forward);
  const goHome = useNavHistory((s) => s.goHome);
  const refresh = useNavHistory((s) => s.refresh);
  const refreshTab = useNavHistory((s) => s.refreshTab);

  /** 右键菜单状态：锚点页签 + 弹出坐标 */
  const [ctx, setCtx] = useState<{ tabId: string; x: number; y: number } | null>(null);

  // 菜单开着时：点击别处 / Esc 关闭
  useEffect(() => {
    if (!ctx) return;
    const onDown = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtx(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  const ctxIdx = ctx ? tabs.indexOf(ctx.tabId) : -1;
  const ctxItems = ctx
    ? [
        { label: "刷新", disabled: false, run: () => void refreshTab(ctx.tabId) },
        { label: "复制网址", disabled: false, run: () => copyTabUrl(ctx.tabId) },
        {
          label: "向左侧添加新标签",
          disabled: ctxIdx === 0,
          run: () => insertNewTabAt(ctx.tabId, "left"),
        },
        { label: "向右侧添加新标签", disabled: false, run: () => insertNewTabAt(ctx.tabId, "right") },
        { label: "关闭左侧", disabled: ctxIdx === 0, run: () => closeSideOf(ctx.tabId, "left") },
        {
          label: "关闭右侧",
          disabled: ctxIdx === tabs.length - 1,
          run: () => closeSideOf(ctx.tabId, "right"),
        },
        { label: "关闭其他", disabled: tabs.length === 1, run: () => closeSideOf(ctx.tabId, "other") },
        { label: "关闭标签页", disabled: false, run: () => closeTab(ctx.tabId) },
      ]
    : [];

  return (
    <div className="tabbar">
      <div className="tabbar__nav">
        <button className="navbtn navbtn--back" title="后退" disabled={!canBack} onClick={back}>
          <AppIcon name="arrowLeft" set={iconSet} size={14} />
        </button>
        <button className="navbtn navbtn--fwd" title="前进" disabled={!canForward} onClick={forward}>
          <AppIcon name="arrowRight" set={iconSet} size={14} />
        </button>
        <button className="navbtn navbtn--home" title="主页" onClick={goHome}>
          <AppIcon name="home" set={iconSet} size={14} />
        </button>
        <button className="navbtn navbtn--refresh" title="刷新" onClick={() => void refresh()}>
          <AppIcon name="refresh" set={iconSet} size={14} />
        </button>
      </div>
      <div className="tabbar__tabs">
        {tabs.map((id) => {
          const page = pages.find((p) => p.id === id);
          if (!page) return null;
          return (
            <div
              key={id}
              className={`tab${id === activeTabId ? " tab--active" : ""}`}
              onClick={() => setActiveTab(id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCtx({ tabId: id, x: e.clientX, y: e.clientY });
              }}
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
      {ctx && (
        <div className="tabctx" style={{ left: ctx.x, top: ctx.y }}>
          {ctxItems.map((item) => (
            <div
              key={item.label}
              className={`tabctx__item${item.disabled ? " tabctx__item--off" : ""}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                setCtx(null);
                item.run();
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
