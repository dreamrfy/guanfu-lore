import { useEffect, useMemo, useRef, useState } from "react";
import { useNavHistory } from "../data/navHistory";
import { useStore } from "../data/store";
import type { PageRow } from "../data/db";
import { clipReadState, unreadClipCount } from "../data/clipBox";
import { searchAll, setPendingBlockFocus, type SearchResult } from "../data/search";
import { AppIcon } from "../design/icons";
import { useLang } from "../i18n";
import { ClipButton } from "./ClipDialog";
import { TagPanel } from "./TagPanel";
import { TemplateMenu } from "./TemplateMenu";

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

export function Sidebar() {
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
  const collections = useStore((s) => s.collections);
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const openCollection = useStore((s) => s.openCollection);
  const createCollection = useStore((s) => s.createCollection);
  const records = useStore((s) => s.records);
  const ensureRecords = useStore((s) => s.ensureRecords);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const goHome = useNavHistory((s) => s.goHome);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
        <span className="sidebar__title">{t("brandTitle")}</span>
        <button className="icon-btn" title="收起侧栏" onClick={toggleSidebar}>
          <AppIcon name="panelLeft" set={iconSet} />
        </button>
      </div>

      <div className="sidebar__icons">
        <button className="sidebar__icon" title="主页" onClick={() => goHome()}>
          <AppIcon name="home" set={iconSet} size={16} />
        </button>
        <button
          className="sidebar__icon"
          title="AI"
          onClick={() => window.dispatchEvent(new CustomEvent("guanfu:open-ai"))}
        >
          <AppIcon name="ai" set={iconSet} size={16} />
        </button>
        <button className="sidebar__icon" title="搜索" onClick={() => searchRef.current?.focus()}>
          <AppIcon name="search" set={iconSet} size={16} />
        </button>
        <button className="sidebar__icon" title="通知（待 W28 通知面板）" disabled>
          <AppIcon name="inbox" set={iconSet} size={16} />
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
            onClick={() => openTab(node.id)}
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
            <span style={{ fontSize: 14 }}>{node.icon ?? ""}</span>
            <AppIcon name="file" set={iconSet} size={14} />
            <span className="tree-item__label">{node.title || "无标题"}</span>
            <span className="tree-item__actions">
              <button
                className="icon-btn"
                title="新建子页面"
                onClick={(e) => {
                  e.stopPropagation();
                  void createPage(node.id);
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
