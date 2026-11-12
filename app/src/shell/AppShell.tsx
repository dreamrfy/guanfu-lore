import { useEffect, useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useActiveDoc, useActivePage, useStore } from "../data/store";
import { assetUrl, uploadAsset } from "../data/assets";
import { AppIcon } from "../design/icons";
import { PageEditor } from "../editor/PageEditor";
import { CollectionView } from "./CollectionView";
import { RightPanel } from "./RightPanel";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { TopToolbar } from "./TopToolbar";

const ICON_CHOICES = ["📄", "📝", "📚", "🧪", "⚗️", "🔬", "🧠", "💡", "📊", "🗂️", "⭐", "🌱", "🔧", "🧩", "🍀", "🔥"];

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

function PageIconPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <div className="page__icon" onClick={() => setOpen((o) => !o)} title="设置页面图标">
        {value ?? <span style={{ fontSize: 20, color: "var(--text-tertiary)" }}>＋ 图标</span>}
      </div>
      {open && (
        <div className="popover popover--grid">
          {ICON_CHOICES.map((emoji) => (
            <button
              key={emoji}
              className="icon-btn"
              style={{ fontSize: 16 }}
              onClick={() => {
                onChange(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
          <button
            className="icon-btn"
            style={{ gridColumn: "span 8", fontSize: 12 }}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            移除图标
          </button>
        </div>
      )}
    </div>
  );
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
  const iconSet = useStore((s) => s.iconSet);
  const renamePage = useStore((s) => s.renamePage);
  const setBlocks = useStore((s) => s.setBlocks);
  const setPageIcon = useStore((s) => s.setPageIcon);
  const uploadFile = useStore((s) => s.uploadFile);
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const page = useActivePage();
  const doc = useActiveDoc();

  // 切页面时把滚动位置拉回顶部
  useEffect(() => {
    document.querySelector(".page")?.scrollTo({ top: 0 });
  }, [page?.id]);

  const docReady = doc !== null;

  return (
    <div className="shell">
      <aside className={`shell__sidebar${sidebarCollapsed ? " shell__sidebar--collapsed" : ""}`}>
        <Sidebar />
      </aside>

      <main className="shell__main">
        <TabBar />
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
                <PageIconPicker value={page.icon} onChange={(v) => setPageIcon(page.id, v)} />

                <input
                  className="page__title"
                  value={page.title}
                  placeholder="无标题"
                  onChange={(e) => renamePage(page.id, e.target.value)}
                />

                <div className="page__meta">
                  最后修改 {new Date(page.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                </div>

                {docReady ? (
                  <PageEditor
                    key={page.id}
                    initialBlocks={doc as PartialBlock[]}
                    theme={theme}
                    onChange={(blocks) => setBlocks(page.id, blocks)}
                    uploadFile={(file) => uploadFile(file, "image", page.id)}
                  />
                ) : (
                  <div className="empty-state">正在载入正文…</div>
                )}
              </>
            )}
          </div>
        </div>
        )}
      </main>

      {rightPanelOpen && (
        <aside className="shell__right">
          <RightPanel page={page} />
        </aside>
      )}
    </div>
  );
}
