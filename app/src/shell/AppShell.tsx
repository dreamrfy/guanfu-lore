import { useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useActiveDoc, useActivePage, useStore } from "../data/store";
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
function PageCover({ pageId, coverAssetId }: { pageId: string; coverAssetId: string | null | undefined }) {
  const setCover = useStore((s) => s.setCover);
  const url = useAssetUrl(coverAssetId);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const { assetId } = await uploadAsset(file, pageId, "cover");
      setCover(pageId, assetId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {url ? (
        <div className="cover" style={{ backgroundImage: `url(${url})` }}>
          <div className="cover__actions">
            <button className="cover__btn" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "上传中…" : "更换封面"}
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
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const theme = useStore((s) => s.theme);
  const navTick = useNavHistory((s) => s.tick);
  const iconSet = useStore((s) => s.iconSet);
  const renamePage = useStore((s) => s.renamePage);
  const setBlocks = useStore((s) => s.setBlocks);
  const setPageIcon = useStore((s) => s.setPageIcon);
  const uploadFile = useStore((s) => s.uploadFile);
  const activeCollectionId = useStore((s) => s.activeCollectionId);
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

  return (
    <div className="shell">
      <TabBar />
      <div className="shell__body">
      <aside className={`shell__sidebar${sidebarCollapsed ? " shell__sidebar--collapsed" : ""}`}>
        <Sidebar />
      </aside>

      <main className="shell__main">
        <TopToolbar />

        {activeCollectionId ? (
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
