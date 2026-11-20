import { useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useActiveDoc, useActivePage, useStore, HOME_TAB } from "../data/store";
import { assetUrl, uploadAsset } from "../data/assets";
import { AppIcon } from "../design/icons";
import { PageEditor } from "../editor/PageEditor";
import { Backlinks } from "./Backlinks";
import { CollectionView } from "./CollectionView";
import { RightPanel } from "./RightPanel";
import { Sidebar } from "./Sidebar";
import { TagBar } from "./TagBar";
import { TabBar } from "./TabBar";
import { useNavHistory } from "../data/navHistory";
import { TopToolbar } from "./TopToolbar";
import { PageIconPicker } from "./PageIconPicker";
import { SearchOverlay } from "./SearchOverlay";
import { AiPanel } from "./AiPanel";
import { HomeAiChat } from "./HomeAiChat";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

/** 把附件 id 解析成可显示的地址（异步，解析期间先给 null） */
function useAssetUrl(assetId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!assetId) {
      setUrl(null);
      return;
    }
    void assetUrl(assetId).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [assetId]);
  return url;
}


/** 页面封面：顶部横幅 + 悬停时出现「更换 / 移除」 */
/** W43 封面渐变预设（来源 docs/复刻/15-颜色体系.md §8「封面渐变」）
 *  渐变端点全部走 CSS 令牌，换皮时只改 tokens.css。 */
const COVER_GRADIENTS: { id: string; label: string; css: string }[] = [
  { id: "xuanzhi", label: "宣纸", css: "var(--gf-cover-xuanzhi)" },
  { id: "yuanshan", label: "远山", css: "var(--gf-cover-yuanshan)" },
  { id: "zhusha", label: "朱砂", css: "var(--gf-cover-zhusha)" },
  { id: "qingci", label: "青瓷", css: "var(--gf-cover-qingci)" },
  { id: "muse", label: "暮色", css: "var(--gf-cover-muse)" },
  { id: "molan", label: "墨蓝", css: "var(--gf-cover-molan)" },
];
const COVER_GRAD_PREFIX = "grad:";

function PageCover({ pageId, coverAssetId }: { pageId: string; coverAssetId: string | null | undefined }) {
  const setCover = useStore((s) => s.setCover);
  const grad = coverAssetId?.startsWith(COVER_GRAD_PREFIX)
    ? COVER_GRADIENTS.find((g) => g.id === coverAssetId.slice(COVER_GRAD_PREFIX.length))
    : null;
  const url = useAssetUrl(grad ? null : coverAssetId);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  // W44：页头 hover 浮条的「添加封面」通过事件打开文件框
  useEffect(() => {
    const add = () => fileRef.current?.click();
    window.addEventListener("guanfu:add-cover", add);
    return () => window.removeEventListener("guanfu:add-cover", add);
  }, []);

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const { assetId } = await uploadAsset(file, pageId, "cover");
      setCover(pageId, assetId);
    } finally {
      setBusy(false);
    }
  };

  const randomGradient = () => {
    const g = COVER_GRADIENTS[Math.floor(Math.random() * COVER_GRADIENTS.length)];
    setCover(pageId, `${COVER_GRAD_PREFIX}${g.id}`);
  };

  const hasCover = Boolean(grad || url);

  return (
    <>
      {hasCover ? (
        <div
          className="cover"
          style={grad ? { backgroundImage: grad.css } : { backgroundImage: `url(${url})` }}
          title={grad ? `封面：${grad.label}` : undefined}
        >
          <div className="cover__actions">
            <button className="cover__btn" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "上传中…" : "更换封面"}
            </button>
            <button className="cover__btn" onClick={randomGradient}>
              随机
            </button>
            <button className="cover__btn" onClick={() => setCover(pageId, null)}>
              移除
            </button>
          </div>
        </div>
      ) : (
        <div className="cover-add">
          <button className="cover__btn cover__btn--ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "上传中…" : "添加封面"}
          </button>
          <button className="cover__btn cover__btn--ghost" onClick={randomGradient}>
            随机封面
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f);
        }}
      />
    </>
  );
}

export function AppShell() {
  // W84 全局快捷键（Ctrl+P 搜索 / Ctrl+\ 侧栏 / Ctrl+T 新页签）
  useGlobalShortcuts();
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  // W90 AI 侧边面板（380px 挤压式）
  const aiPanelOpen = useStore((s) => s.aiPanelOpen);
  const toggleAiPanel = useStore((s) => s.toggleAiPanel);
  const theme = useStore((s) => s.theme);
  const navTick = useNavHistory((s) => s.tick);
  const iconSet = useStore((s) => s.iconSet);
  const renamePage = useStore((s) => s.renamePage);
  const setBlocks = useStore((s) => s.setBlocks);
  const setPageIcon = useStore((s) => s.setPageIcon);
  const uploadFile = useStore((s) => s.uploadFile);
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const activeTabId = useStore((s) => s.activeTabId);
  // W94 桌面主页：activeTabId=HOME_TAB 时主区渲染 AI 对话页（无文档页顶栏）
  const isHome = activeTabId === HOME_TAB;
  // W26 删除红幅（手册 §2：无确认弹窗 + 红幅「恢复/彻底删除」）
  const trashBanner = useStore((s) => s.trashBanner);
  const restoreFromTrash = useStore((s) => s.restoreFromTrash);
  const purgeFromTrash = useStore((s) => s.purgeFromTrash);
  const clearTrashBanner = useStore((s) => s.clearTrashBanner);
  // 记录详情里要放正文编辑器，窄面板不够用
  const recordOpen = useStore((s) => s.openRecordRef !== null);
  const page = useActivePage();
  const doc = useActiveDoc();
  // 切页面时按页签记忆恢复滚动（W15 页签=独立实例【暂定】：同窗口隔离实现；
  // Tauri 2 多窗口核验结论见对照文档——真·每页签独立 webview 留架构专项）
  const scrollMemo = useRef<Map<string, number>>(new Map());
  // 滚动时实时记忆当前页位置（切页后 DOM 已换内容，effect 里读不到旧位置）
  useEffect(() => {
    const el = document.querySelector(".page");
    if (!el) return;
    const onScroll = () => {
      if (page?.id) scrollMemo.current.set(page.id, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [page?.id]);
  // 切页后恢复目标页的记忆滚动（等编辑器渲染一帧）
  useEffect(() => {
    const el = document.querySelector(".page");
    if (!el) return;
    const target = scrollMemo.current.get(page?.id ?? "") ?? 0;
    const t = setTimeout(() => el.scrollTo({ top: target }), 60);
    return () => clearTimeout(t);
  }, [page?.id]);
  const docReady = doc !== null;

  // W47 窄口（Web <768）：侧栏改抽屉（默认收起，☰ 打开），桌面形态完全不受影响
  const [narrow, setNarrow] = useState(false);
  const [narrowOpen, setNarrowOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      setNarrow(mq.matches);
      if (!mq.matches) setNarrowOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div className={`shell${narrow ? " shell--narrow" : ""}${narrow && narrowOpen ? " shell--narrow-open" : ""}`}>
      {narrow && (
        <button className="narrow-menu" title="打开侧栏" onClick={() => setNarrowOpen((o) => !o)}>
          <AppIcon name="panelLeft" set={iconSet} size={16} />
        </button>
      )}
      {narrow && narrowOpen && (
        <div className="narrow-scrim" onClick={() => setNarrowOpen(false)} />
      )}
      <TabBar />
      <SearchOverlay />
      <div className="shell__body">
      <aside className={`shell__sidebar${sidebarCollapsed ? " shell__sidebar--collapsed" : ""}`}>
        <Sidebar />
      </aside>

      <main className="shell__main">
        {!isHome && <TopToolbar />}

        {isHome ? (
          <HomeAiChat />
        ) : activeCollectionId ? (
          <CollectionView collectionId={activeCollectionId} />
        ) : (
        <div className="page">
          {page && <PageCover pageId={page.id} coverAssetId={page.coverAssetId} />}

          <div className="page__inner">
            {!page ? (
              <div className="empty-state">
                <AppIcon name="file" set={iconSet} size={20} />
                <div style={{ marginTop: 8 }}>没有打开的页面</div>
              </div>
            ) : (
              <>
                <PageIconPicker value={page.icon} onChange={(v) => setPageIcon(page.id, v)} iconSet={iconSet} />

                {/* W44 页头 hover 浮条（07 §4：添加图标 / 添加封面 / 添加评论；评论待专项置灰） */}
                <div className="pagehead-add">
                  {!page.icon && (
                    <button
                      className="pagehead-add__chip"
                      onClick={() => window.dispatchEvent(new CustomEvent("guanfu:open-icon-picker"))}
                    >
                      ＋ 添加图标
                    </button>
                  )}
                  {!page.coverAssetId && (
                    <button
                      className="pagehead-add__chip"
                      onClick={() => window.dispatchEvent(new CustomEvent("guanfu:add-cover"))}
                    >
                      🖼 添加封面
                    </button>
                  )}
                  <button className="pagehead-add__chip" disabled title="评论体系待专项（【暂定】）">
                    💬 添加评论
                  </button>
                </div>

                <input
                  className="page__title"
                  value={page.title}
                  placeholder="无标题"
                  onChange={(e) => renamePage(page.id, e.target.value)}
                />

                <TagBar pageId={page.id} />

                <div className="page__meta">
                  最后修改 {new Date(page.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                </div>

                {docReady ? (
                  <PageEditor
                    key={`p${page.id}r${navTick}`}
                    initialBlocks={doc as PartialBlock[]}
                    theme={theme}
                    onChange={(blocks) => setBlocks(page.id, blocks)}
                    uploadFile={(file) => uploadFile(file, "image", page.id)}
                  />
                ) : (
                  <div className="empty-state">正在载入正文…</div>
                )}

                {page && <Backlinks pageId={page.id} />}
              </>
            )}
          </div>
        </div>
        )}
      </main>

      {/* W90 AI 侧边面板：正常 flex 流内、挤压主区而非覆盖（10 号 §1） */}
      {aiPanelOpen && (
        <aside className="shell__ai" aria-label="观复 AI">
          <AiPanel initialTab="chat" hideTabs />
        </aside>
      )}

      {/* W90 右下角浮钮（ai-chat-trigger）：文档页内出现，面板已开则隐藏 */}
      {page && !aiPanelOpen && (
        <button className="ai-fab" title="观复 AI" onClick={toggleAiPanel}>
          <AppIcon name="ai" set={iconSet} size={18} />
        </button>
      )}

      {rightPanelOpen && (
        <aside className={`shell__right${recordOpen ? " shell__right--wide" : ""}`}>
          <RightPanel page={page} />
        </aside>
      )}
      </div>

      {trashBanner && (
        <div className="trashbar" role="status">
          <span className="trashbar__text">
            🗑 {trashBanner.title || "无标题"} 已删除
            {trashBanner.ids.length > 1 ? `（含 ${trashBanner.ids.length - 1} 个子页）` : ""}
          </span>
          <button className="trashbar__btn" onClick={() => void restoreFromTrash(trashBanner.ids[0])}>
            恢复
          </button>
          <button
            className="trashbar__btn trashbar__btn--danger"
            onClick={() => {
              for (const id of trashBanner.ids) void purgeFromTrash(id);
              clearTrashBanner();
            }}
          >
            彻底删除
          </button>
          <button className="trashbar__close" title="关闭" onClick={clearTrashBanner}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
