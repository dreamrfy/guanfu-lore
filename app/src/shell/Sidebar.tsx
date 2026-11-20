import { useEffect, useMemo, useRef, useState } from "react";
import { useNavHistory } from "../data/navHistory";
import { useStarred } from "../data/starred";
import { PageIconGlyph } from "../design/pageIcons";
import { createPageFromTemplate, listTemplates, type PageTemplate } from "../data/templates";
import { useStore } from "../data/store";
import type { PageRow } from "../data/db";
import { clipReadState, unreadClipCount } from "../data/clipBox";
import { searchAll, setPendingBlockFocus, type SearchResult } from "../data/search";
import { AppIcon } from "../design/icons";
import { useLang } from "../i18n";
import { ClipButton } from "./ClipDialog";
import { TagPanel } from "./TagPanel";
import { TemplateMenu } from "./TemplateMenu";
import { openSearchOverlay } from "./SearchOverlay";

/** 命中处加亮 */
function Snippet({ text, start, end }: { text: string; start: number; end: number }) {
  return (
    <span className="hit__snippet">
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </span>
  );
}

type TreeNode = { id: string; title: string; icon: string | null; depth: number };

/**
 * 把扁平的页面列表摊平成带缩进的树。
 *
 * 关键点（都是会真实发生的边界）：
 *  - **孤儿页兜底**：父级被删掉/进了回收站时，子页不能跟着从侧栏消失 → 这种情况当顶层显示。
 *  - **防环**：数据里万一已经有环（历史 bug 或手工改库），遍历时用 guard 集合拦住，避免死循环。
 */
export function buildTree(pages: PageRow[], collapsed: ReadonlySet<string> = new Set()): TreeNode[] {
  const ids = new Set(pages.map((p) => p.id));
  const out: TreeNode[] = [];
  const guard = new Set<string>();

  const childrenOf = (parentId: string | null) =>
    pages.filter((p) => {
      const effectiveParent = p.parentId && ids.has(p.parentId) ? p.parentId : null;
      return effectiveParent === parentId;
    });

  /** 收起时把整棵子树标为已访问（不出行，也不进孤儿兜底） */
  const markHidden = (parentId: string) => {
    for (const p of childrenOf(parentId)) {
      if (guard.has(p.id)) continue;
      guard.add(p.id);
      markHidden(p.id);
    }
  };

  const walk = (parentId: string | null, depth: number) => {
    for (const p of childrenOf(parentId)) {
      if (guard.has(p.id)) continue;
      guard.add(p.id);
      out.push({ id: p.id, title: p.title, icon: p.icon, depth });
      // W22 展开/收起：收起的节点不展开子树（节点本身仍显示）；
      // 子树要标记为已访问，否则会被下面的「孤儿页兜底」当成孤儿补回顶层
      if (!collapsed.has(p.id)) walk(p.id, depth + 1);
      else markHidden(p.id);
    }
  };

  walk(null, 0);

  // 极端情况：页面之间存在纯环（谁也到不了根），上面遍历会漏掉它们——补在末尾，至少能看见
  for (const p of pages) {
    if (!guard.has(p.id)) out.push({ id: p.id, title: p.title, icon: p.icon, depth: 0 });
  }
  return out;
}

const fmt = (t: number) =>
  new Date(t).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export function Sidebar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const pages = useStore((s) => s.pages);
  const trash = useStore((s) => s.trash);
  const activeTabId = useStore((s) => s.activeTabId);
  const iconSet = useStore((s) => s.iconSet);
  const { lang, setLang, t } = useLang();
  const openTab = useStore((s) => s.openTab);
  const createPage = useStore((s) => s.createPage);
  const moveToTrash = useStore((s) => s.moveToTrash);
  const restoreFromTrash = useStore((s) => s.restoreFromTrash);
  const purgeFromTrash = useStore((s) => s.purgeFromTrash);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setParent = useStore((s) => s.setParent);
  const duplicatePage = useStore((s) => s.duplicatePage);
  const renamePage = useStore((s) => s.renamePage);
  const collections = useStore((s) => s.collections);
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const openCollection = useStore((s) => s.openCollection);
  const createCollection = useStore((s) => s.createCollection);
  const records = useStore((s) => s.records);
  const ensureRecords = useStore((s) => s.ensureRecords);

  const searchRef = useRef<HTMLInputElement | null>(null);

/** W23 右键菜单辅助：页面深链 / 在侧栏定位 / 新窗口打开 */
  const pageLink = (origin: string, path: string, id: string) => `${origin}${path}?page=${id}`;
  const revealRow = (id: string) => {
    if (useStore.getState().sidebarCollapsed) toggleSidebar();
    setTimeout(() => {
      document.querySelector(`[data-page-id="${id}"]`)?.scrollIntoView({ block: "center" });
    }, 120);
  };
  const openInNewWindow = (id: string) => {
    const url = pageLink(location.origin, location.pathname, id);
    const tauri = (
      window as unknown as {
        __TAURI__?: {
          webviewWindow?: { WebviewWindow?: new (l: string, o: Record<string, unknown>) => unknown };
        };
      }
    ).__TAURI__;
    if (tauri?.webviewWindow?.WebviewWindow) {
      try {
        new tauri.webviewWindow.WebviewWindow(`page-${id.slice(0, 8)}-${Date.now()}`, {
          url,
          width: 1200,
          height: 800,
          title: "观复 · Lore",
        });
        return;
      } catch {
        /* 权限未开时退回浏览器弹窗 */
      }
    }
    window.open(url, "_blank", "width=1200,height=800");
  };
  const goHome = useNavHistory((s) => s.goHome);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // W23 行右键菜单 / 重命名 / 快速访问
  const [rowCtx, setRowCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const [movePick, setMovePick] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newChild, setNewChild] = useState<{ parentId: string; x: number; y: number } | null>(null);
  const [wsMenu, setWsMenu] = useState(false);
  // W28 通知面板：入口=图标行「通知」，浮层 ~500 宽；条目来自真实状态（同步/剪藏/回收站）
  const [notif, setNotif] = useState<{ x: number; y: number } | null>(null);
  const [notifFilter, setNotifFilter] = useState<"all" | "sync" | "content">("all");
  const syncStatus = useStore((s) => s.syncStatus);
  const runSyncNow = useStore((s) => s.runSyncNow);
  const [tplPick, setTplPick] = useState<PageTemplate[] | null>(null);
  // 快速访问集合（W46 抽到共享 store，页面 ⋯ 菜单也能勾选）
  const starredIds = useStarred((s) => s.ids);
  const toggleStar = useStarred((s) => s.toggle);
  const starred = useMemo(() => new Set(starredIds), [starredIds]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 剪藏未读总数（通知面板角标/条目都用它）
  const unreadTotal = useMemo(
    () => collections.reduce((n, c) => n + unreadClipCount(c, records[c.id]), 0),
    [collections, records],
  );

  /** W28 通知面板条目：全部来自真实状态，点条目跳到对应位置 */
  const notices = useMemo(() => {
    const hm = (t: number | null) =>
      t ? new Date(t).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    type Notice = {
      id: string;
      kind: "sync" | "content";
      icon: string;
      title: string;
      sub: string;
      at: string;
      run: () => void;
    };
    const list: Notice[] = [];
    list.push({
      id: "sync",
      kind: "sync",
      icon: "🔄",
      title: syncStatus.busy
        ? "正在同步…"
        : syncStatus.pending > 0
          ? `${syncStatus.pending} 条改动待推送`
          : "本地改动已全部推送",
      sub: syncStatus.lastSyncAt ? "点此立即同步一次" : "尚未同步过 · 点此开始",
      at: hm(syncStatus.lastSyncAt),
      run: () => {
        setNotif(null);
        void runSyncNow().catch(() => {});
      },
    });
    if (syncStatus.conflicts > 0) {
      list.push({
        id: "conflict",
        kind: "sync",
        icon: "⚠️",
        title: `${syncStatus.conflicts} 个同步冲突待处理`,
        sub: "冲突副本已保留，可在同步面板里比对",
        at: hm(syncStatus.lastErrorAt),
        run: () => setNotif(null),
      });
    }
    list.push({
      id: "clip",
      kind: "content",
      icon: "📥",
      title: unreadTotal > 0 ? `${unreadTotal} 条剪藏未读` : "没有未读剪藏",
      sub: collections.length ? `共 ${collections.length} 个收集表` : "还没有收集表",
      at: "",
      run: () => {
        const c = collections.find((c) => unreadClipCount(c, records[c.id]) > 0) ?? collections[0];
        setNotif(null);
        if (c) void openCollection(c.id);
      },
    });
    list.push({
      id: "trash",
      kind: "content",
      icon: "🗑",
      title: trash.length > 0 ? `回收站有 ${trash.length} 个页面` : "回收站为空",
      sub: "删除的页面可恢复或彻底删除",
      at: hm(trash[0]?.deletedAt ?? null),
      run: () => {
        setNotif(null);
        setTrashOpen(true);
      },
    });
    return list;
  }, [syncStatus, unreadTotal, collections, records, trash, runSyncNow, openCollection]);

  // Esc 关闭通知面板 / 空间切换菜单（W28）
  useEffect(() => {
    if (!notif && !wsMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotif(null);
        setWsMenu(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notif, wsMenu]);

  const withKids = useMemo(
    () => new Set(pages.filter((p) => p.parentId).map((p) => p.parentId as string)),
    [pages],
  );

  const tree = useMemo(() => {
    const rows = buildTree(pages, collapsed);
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => r.title.toLowerCase().includes(q)).map((r) => ({ ...r, depth: 0 }));
  }, [pages, query, collapsed]);

  // 收集箱（带未读/已读的表）的未读角标：开机侧栏就要能显示，
  // 所以这里提前把它的记录补进内存（进过内存后，自动导入/标已读会实时刷新角标）
  useEffect(() => {
    for (const c of collections) {
      if (clipReadState(c) && !records[c.id]) void ensureRecords(c.id);
    }
  }, [collections, records, ensureRecords]);

  const flash = (msg: string) => {
    setHint(msg);
    setTimeout(() => setHint(null), 2600);
  };

  // 全文搜索（标题 + 正文）。200ms 防抖：不要每敲一个字就把整库扫一遍
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void searchAll(q).then((r) => {
        setResults(r);
        setSearching(false);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, pages.length]);

  /** 打开命中所在页面；正文命中还要滚到那一块 */
  const openHit = (pageId: string, blockId: string) => {
    openTab(pageId);
    setPendingBlockFocus(blockId || null);
  };

  const handleDrop = (targetParentId: string | null) => {
    const dragged = dragging;
    setDragging(null);
    setDropTarget(null);
    if (!dragged) return;
    const ok = setParent(dragged, targetParentId);
    if (!ok) flash("不能把页面移到自己或自己的子页面底下");
  };

  return (
    <>
      <div className="sidebar__header">
        {/* W27 工作区行（手册 §2：211×38 @(8,8) 圆角 6；头像 26×26 圆角 4；⌄ 开空间切换菜单）
            观复只有本地空间，菜单项按【暂定】自有实现；收起侧栏并入本菜单（顶部工具条也有同样入口） */}
        <button
          className="wsrow"
          title="空间切换"
          onMouseDown={(e) => {
            e.stopPropagation();
            setWsMenu((o) => !o);
          }}
        >
          <span className="wsrow__avatar">观</span>
          <span className="wsrow__name">{t("brandTitle")}</span>
          <span className="wsrow__caret">⌄</span>
        </button>
      </div>

      <div className="sidebar__icons">
        <button className="sidebar__icon" title="主页" onClick={() => goHome()}>
          <AppIcon name="home" set={iconSet} size={16} />
        </button>
        <button
          className="sidebar__icon"
          title="AI"
          onClick={() => useStore.getState().toggleAiPanel()}
        >
          <AppIcon name="ai" set={iconSet} size={16} />
        </button>
        <button className="sidebar__icon" title="搜索" onClick={() => openSearchOverlay()}>
          <AppIcon name="search" set={iconSet} size={16} />
        </button>
        <button
          className="sidebar__icon"
          title="通知"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setNotif((n) => (n ? null : { x: r.left, y: r.bottom + 6 }));
          }}
        >
          <AppIcon name="inbox" set={iconSet} size={16} />
          {unreadTotal > 0 && <span className="sidebar__icon-dot" />}
        </button>
        <button
          className="sidebar__icon"
          title="更多"
          onClick={() => window.dispatchEvent(new CustomEvent("guanfu:import-file"))}
        >
          <AppIcon name="more" set={iconSet} size={16} />
        </button>
      </div>

      <label className="sidebar__search">
        <AppIcon name="search" set={iconSet} size={14} />
        <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} />
      </label>

      <div className="sidebar__list">
        {starred.size > 0 && (
                  <>
                    <div className="sidebar__group-label">
                      <span>快速访问</span>
                    </div>
                    {pages
                      .filter((p) => starred.has(p.id))
                      .map((p) => (
                        <div
                          key={`star-${p.id}`}
                          className={`tree-item tree-item--starred${p.id === activeTabId ? " tree-item--active" : ""}`}
                          data-page-id={p.id}
                          style={{ paddingLeft: 8 }}
                          onClick={() => openTab(p.id)}
                          title={p.title || "无标题"}
                        >
                          <span className="tree-item__chev tree-item__chev--none" />
                          <PageIconGlyph icon={p.icon} size={14} set={iconSet} />
                          <AppIcon name="star" set={iconSet} size={14} />
                          <span className="tree-item__label">{p.title || "无标题"}</span>
                        </div>
                      ))}
                  </>
                )}

        <div
          className={`sidebar__group-label${dropTarget === "root" ? " sidebar__group-label--drop" : ""}`}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setDropTarget("root");
          }}
          onDragLeave={() => setDropTarget((t) => (t === "root" ? null : t))}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(null);
          }}
          title="把页面拖到这里 = 移到最外层"
        >
          <span>{t("groupPages")}</span>
          <span style={{ flex: "1 1 auto" }} />
          <button className="groupbtn" title="设置（待 W100 设置弹层接线）" disabled>
            <AppIcon name="settings" set={iconSet} size={12} />
          </button>
          <button
            className="groupbtn"
            title="新建页面"
            onClick={(e) => {
              e.stopPropagation();
              void createPage(null);
            }}
          >
            <AppIcon name="plus" set={iconSet} size={12} />
          </button>
        </div>

        {!query.trim() && (
          <>
            <div className="sidebar__group-label">
              <span>{t("groupTables")}</span>
              <span style={{ flex: "1 1 auto" }} />
              <button className="groupbtn" title="设置（待 W100 设置弹层接线）" disabled>
                <AppIcon name="settings" set={iconSet} size={12} />
              </button>
              <button
                className="groupbtn"
                title={t("newTable")}
                onClick={(e) => {
                  e.stopPropagation();
                  void createCollection();
                }}
              >
                <AppIcon name="plus" set={iconSet} size={13} />
              </button>
            </div>
            {collections.length === 0 && <div className="sidebar__hint">{t("emptyTables")}</div>}
            {collections.map((c) => {
              const unread = unreadClipCount(c, records[c.id]);
              return (
                <div
                  key={c.id}
                  className={`tree-item${c.id === activeCollectionId ? " tree-item--active" : ""}`}
                  onClick={() => void openCollection(c.id)}
                  title={c.name}
                >
                  <span style={{ fontSize: 14 }}>{c.icon ?? "🗂️"}</span>
                  <span className="tree-item__label">{c.name}</span>
                  {unread > 0 && (
                    <span className="sidebar__badge" title={`${unread} 条未读`}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </div>
              );
            })}
          </>
        )}

        {query.trim() ? (
          <>
            {searching && <div className="empty-state">搜索中…</div>}
            {!searching && results.length === 0 && <div className="empty-state">{t("searchNoResult")}</div>}
            {results.map((r) => {
              const bodyHits = r.hits.filter((h) => h.blockId);
              return (
                <div key={r.pageId} className="hit">
                  <div className="hit__page" onClick={() => openHit(r.pageId, "")} title={r.title}>
                    <AppIcon name="file" set={iconSet} size={13} />
                    <span className="hit__page-title">{r.title}</span>
                    <span className="hit__count">{bodyHits.length ? `${bodyHits.length} 处` : "标题"}</span>
                  </div>
                  {bodyHits.map((h, i) => (
                    <div key={`${h.blockId}-${i}`} className="hit__row" onClick={() => openHit(h.pageId, h.blockId)}>
                      <Snippet text={h.snippet} start={h.start} end={h.end} />
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        ) : (
          <>
            {tree.length === 0 && <div className="empty-state">{t("emptyPages")}</div>}

            {tree.map((node) => (
          <div
            key={node.id}
            className={[
              "tree-item",
              node.id === activeTabId ? "tree-item--active" : "",
              dragging === node.id ? "tree-item--dragging" : "",
              dropTarget === node.id ? "tree-item--drop" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ paddingLeft: 8 + node.depth * 14 }}
            data-page-id={node.id}
            onClick={() => openTab(node.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setRowCtx({ id: node.id, x: e.clientX, y: e.clientY });
              setMovePick(false);
            }}
            title={node.title || "无标题"}
            draggable
            onDragStart={(e) => {
              setDragging(node.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", node.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onDragOver={(e) => {
              if (!dragging || dragging === node.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropTarget(node.id);
            }}
            onDragLeave={() => setDropTarget((t) => (t === node.id ? null : t))}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // 拖到某条上面 = 成为它的子页面
              handleDrop(node.id);
            }}
          >
            {withKids.has(node.id) ? (
              <button
                className={"tree-item__chev"}
                title={collapsed.has(node.id) ? "展开子页" : "收起子页"}
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  });
                }}
              >
                <AppIcon name={collapsed.has(node.id) ? "chevronRight" : "chevronDown"} set={iconSet} size={12} />
              </button>
            ) : (
              <span className="tree-item__chev tree-item__chev--none" />
            )}
            <PageIconGlyph icon={node.icon} size={14} set={iconSet} />
            <AppIcon name="file" set={iconSet} size={14} />
            {renaming === node.id ? (
              <input
                className="tree-item__rename"
                defaultValue={node.title}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  renamePage(node.id, e.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
            ) : (
              <span className="tree-item__label">{node.title || "无标题"}</span>
            )}
            <span className="tree-item__actions">
              {/* W24 行「…」菜单：与右键菜单同一份定义（语义与文案一致） */}
              <button
                className="icon-btn"
                title="更多"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setRowCtx({ id: node.id, x: r.left, y: r.bottom + 4 });
                  setMovePick(false);
                }}
              >
                <AppIcon name="more" set={iconSet} size={14} />
              </button>
              <button
                className="icon-btn"
                title="新建子页面"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setNewChild({ parentId: node.id, x: r.left, y: r.bottom + 4 });
                }}
              >
                <AppIcon name="plus" set={iconSet} size={14} />
              </button>
              <button
                className="icon-btn"
                title="移到回收站"
                onClick={(e) => {
                  e.stopPropagation();
                  void moveToTrash(node.id);
                }}
              >
                <AppIcon name="trash" set={iconSet} size={14} />
              </button>
            </span>
          </div>
            ))}
          </>
        )}
      </div>

      {rowCtx && (
              <>
                <div
                  className="ctx-backdrop"
                  onMouseDown={() => {
                    setRowCtx(null);
                    setMovePick(false);
                  }}
                />
                <div className="tabctx tabctx--row" style={{ left: rowCtx.x, top: rowCtx.y }}>
                  {movePick ? (
                    <>
                      <div
                        className="tabctx__item tabctx__item--head"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setMovePick(false);
                        }}
                      >
                        ← 返回
                      </div>
                      <div
                        className="tabctx__item"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (setParent(rowCtx.id, null)) flash("已移到顶层");
                          setRowCtx(null);
                          setMovePick(false);
                        }}
                      >
                        顶层
                      </div>
                      {pages
                        .filter((p) => p.id !== rowCtx.id)
                        .slice(0, 20)
                        .map((p) => (
                          <div
                            key={p.id}
                            className="tabctx__item"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              if (!setParent(rowCtx.id, p.id)) flash("不能移到自己或自己的子页面下");
                              setRowCtx(null);
                              setMovePick(false);
                            }}
                          >
                            {p.title || "无标题"}
                          </div>
                        ))}
                    </>
                  ) : (
                    [
                      {
                        label: starred.has(rowCtx.id) ? "从快速访问移除" : "添加到快速访问",
                        run: () => toggleStar(rowCtx.id),
                      },
                      { label: "拷贝副本", run: () => void duplicatePage(rowCtx.id) },
                      {
                        label: "复制页面链接",
                        run: () =>
                          void navigator.clipboard
                            .writeText(pageLink(location.origin, location.pathname, rowCtx.id))
                            .catch(() => {}),
                      },
                      { label: "重命名", run: () => setRenaming(rowCtx.id) },
                      { label: "移动到…", run: null },
                      { label: "删除", run: () => void moveToTrash(rowCtx.id) },
                      {
                        label: "在侧边栏打开",
                        run: () => revealRow(rowCtx.id),
                      },
                      {
                        label: "在新窗口打开",
                        run: () => openInNewWindow(rowCtx.id),
                      },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="tabctx__item"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (!item.run) {
                            setMovePick(true);
                            return;
                          }
                          item.run();
                          // 延后一 tick 关菜单：否则同一次点击的 click 会落到下面的行上，把重命名输入框 blur 掉
                          setTimeout(() => setRowCtx(null), 0);
                        }}
                      >
                        {item.label}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

      {wsMenu && (
        <>
          <div className="ctx-backdrop" onMouseDown={() => setWsMenu(false)} />
          <div className="tabctx tabctx--ws">
            <div className="tabctx__item tabctx__item--head" onMouseDown={(e) => e.stopPropagation()}>
              工作空间
            </div>
            <div className="tabctx__item tabctx__item--off">本地空间（当前）</div>
            <div
              className="tabctx__item"
              onMouseDown={(e) => {
                e.stopPropagation();
                setWsMenu(false);
                onOpenSettings?.();
              }}
            >
              空间设置
            </div>
            <div
              className="tabctx__item"
              onMouseDown={(e) => {
                e.stopPropagation();
                setWsMenu(false);
                toggleSidebar();
              }}
            >
              收起侧栏
            </div>
          </div>
        </>
      )}

      {notif && (
        <>
          <div className="ctx-backdrop" onMouseDown={() => setNotif(null)} />
          <div className="notif" style={{ left: notif.x, top: notif.y }}>
            <div className="notif__head">
              <span className="notif__title">通知</span>
              <div className="notif__filters">
                {(["all", "sync", "content"] as const).map((f) => (
                  <button
                    key={f}
                    className={`notif__filter${notifFilter === f ? " notif__filter--on" : ""}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setNotifFilter(f);
                    }}
                  >
                    {f === "all" ? "全部" : f === "sync" ? "同步" : "内容"}
                  </button>
                ))}
              </div>
            </div>
            <div className="notif__list">
              {notices
                .filter((n) => notifFilter === "all" || n.kind === notifFilter)
                .map((n) => (
                  <div
                    key={n.id}
                    className="notif__item"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      n.run();
                    }}
                  >
                    <span className="notif__avatar">{n.icon}</span>
                    <span className="notif__body">
                      <span className="notif__row1">
                        <span className="notif__name">{n.title}</span>
                        {n.at && <span className="notif__at">{n.at}</span>}
                      </span>
                      <span className="notif__sub">{n.sub}</span>
                    </span>
                  </div>
                ))}
              {notices.filter((n) => notifFilter === "all" || n.kind === notifFilter).length === 0 && (
                <div className="notif__empty">这个筛选下没有通知</div>
              )}
            </div>
          </div>
        </>
      )}

      {newChild && (
              <>
                <div
                  className="ctx-backdrop"
                  onMouseDown={() => {
                    setNewChild(null);
                    setTplPick(null);
                  }}
                />
                <div className="newchild" style={{ left: newChild.x, top: newChild.y }}>
                  {tplPick ? (
                    <>
                      <div className="newchild__head">选择模板（{tplPick.length} 个）</div>
                      {tplPick.length === 0 && <div className="newchild__hint">还没有模板：可在页面 ⋯ 菜单里「存为模板」</div>}
                      {tplPick.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="newchild__item"
                          onMouseDown={async (e) => {
                            e.stopPropagation();
                            const id = await createPageFromTemplate(tpl);
                            if (newChild.parentId) setParent(id, newChild.parentId);
                            setNewChild(null);
                            setTplPick(null);
                          }}
                        >
                          <span className="newchild__label">{tpl.name}</span>
                        </div>
                      ))}
                      <div
                        className="newchild__item newchild__item--back"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setTplPick(null);
                        }}
                      >
                        ← 返回
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="newchild__head">新建</div>
                      <div
                        className="newchild__item"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          void createPage(newChild.parentId);
                          setNewChild(null);
                        }}
                      >
                        <span className="newchild__label">页面</span>
                        <span className="newchild__kbd">↵</span>
                      </div>
                      <div
                        className="newchild__item"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          void createPage(newChild.parentId).then((id) => renamePage(id, "未命名文件夹"));
                          setNewChild(null);
                        }}
                      >
                        <span className="newchild__label">文件夹【暂定】</span>
                      </div>
                      <div className="newchild__item newchild__item--off" title="待 AI 专项">
                        <span className="newchild__label">AI 写作</span>
                      </div>
                      <div className="newchild__item newchild__item--off" title="待独有功能专项">
                        <span className="newchild__label">思维导图</span>
                      </div>
                      <div
                        className="newchild__item"
                        onMouseDown={async (e) => {
                          e.stopPropagation();
                          setTplPick(await listTemplates());
                        }}
                      >
                        <span className="newchild__label">模板</span>
                      </div>
                      <div
                        className="newchild__item"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          window.dispatchEvent(new CustomEvent("guanfu:import-file"));
                          setNewChild(null);
                        }}
                      >
                        <span className="newchild__label">导入</span>
                      </div>
      
                      <div className="newchild__head newchild__head--sub">多维表</div>
                      <div
                        className="newchild__item"
                        onMouseDown={async (e) => {
                          e.stopPropagation();
                          await createCollection();
                          setNewChild(null);
                        }}
                      >
                        <span className="newchild__label">表格</span>
                      </div>
                      {["看板", "画廊", "目录", "时间轴", "日历"].map((v) => (
                        <div key={v} className="newchild__item newchild__item--off" title={`${v}视图待 W71~W75`}>
                          <span className="newchild__label">{v}【待视图批】</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}

      <div className="sidebar__footer">
        {hint && <div className="sidebar__hint">{hint}</div>}

        {trashOpen && (
          <div className="trash">
            {trash.length === 0 && <div className="trash__empty">{t("trashEmpty")}</div>}
            {trash.map((row) => (
              <div key={row.id} className="trash__item">
                <span
                  className="trash__name"
                  title={`${row.title || "无标题"}（${fmt(row.deletedAt ?? row.updatedAt)} 删除）`}
                >
                  {row.icon ? `${row.icon} ` : ""}
                  {row.title || "无标题"}
                </span>
                <button className="icon-btn" title="恢复" onClick={() => void restoreFromTrash(row.id)}>
                  恢复
                </button>
                <button
                  className="icon-btn"
                  title="彻底删除（不可恢复）"
                  onClick={() => {
                    if (confirm(`彻底删除「${row.title || "无标题"}」？此操作不可恢复。`)) {
                      void purgeFromTrash(row.id);
                    }
                  }}
                >
                  <AppIcon name="trash" set={iconSet} size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          className="icon-btn"
          style={{ width: "100%", justifyContent: "flex-start" }}
          onClick={() => setTrashOpen((v) => !v)}
        >
          <AppIcon name="trash" set={iconSet} />
          回收站{trash.length > 0 ? `（${trash.length}）` : ""}
        </button>

        <ClipButton />

        <TagPanel />
        <TemplateMenu />

        <button
          className="icon-btn"
          style={{ width: "100%", justifyContent: "flex-start" }}
          onClick={() => void createPage(null)}
        >
          <AppIcon name="plus" set={iconSet} />
          {t("newPage")}
        </button>

        <button
          className="icon-btn"
          style={{ width: "100%", justifyContent: "flex-start" }}
          title="切换语言 / Switch language"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
        >
          <span style={{ fontSize: 12, letterSpacing: 2 }}>{lang === "zh" ? "EN" : "中"}</span>
          {lang === "zh" ? "English" : "中文"}
        </button>
      </div>
    </>
  );
}
