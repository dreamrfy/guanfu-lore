/**
 * 全局搜索浮层（W80 / W81 / W82 / W83）
 *
 * 规格来源：08 §1「桌面/网页端全局搜索面板」
 *  - 入口三个：顶栏右侧放大镜 / 侧栏图标行第 3 钮 🔍 / Ctrl+P（快捷键真触发）
 *  - 形态：居中浮层，宽约 800，y≈88..512；大输入框（左 🔍 + 占位「在页面中搜索」）
 *  - 页签行：页面（选中）｜对话；过滤行：`A` 只搜索标题｜👤 创建者 ⌄｜范围 chip｜＋
 *  - 默认态：「在 [当前页] 中问 AI」行 + 「最近浏览」分组（**含已删除页**）
 *  - 输入后：AI 行变「问问 AI「关键词」」；结果区按范围过滤
 *  - Escape 关闭
 *
 * 窄口（<768px）：按 08 §2 手机端规格走**全屏页**形态（顶栏「取消」+ 居中「搜索」）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon, type IconName } from "../design/icons";
import { PageIconGlyph } from "../design/pageIcons";
import { useLang } from "../i18n";
import { getRecentItems, type RecentItem } from "../data/recent";
import { searchAll, setPendingBlockFocus, sortSearchResults, type SearchResult, type SearchSort } from "../data/search";
import { useStore } from "../data/store";

/** 范围 chip：限定在某一页里搜 */
type Scope = { pageId: string; title: string };

type Tab = "pages" | "chats";

/** 打开浮层的事件名（与既有 guanfu:open-ai 等同一模式） */
export const OPEN_SEARCH_EVENT = "guanfu:open-search";

export function openSearchOverlay() {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}

export function SearchOverlay() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("pages");
  const [titleOnly, setTitleOnly] = useState(false);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [sortOpen, setSortOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const pages = useStore((s) => s.pages);
  const activeTabId = useStore((s) => s.activeTabId);
  const activePage = pages.find((p) => p.id === activeTabId) ?? null;
  const dispatchAiCommand = useStore((s) => s.dispatchAiCommand);
  const iconSet = useStore((s) => s.iconSet);

  // 窄口 = 全屏页形态（08 §2）
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // 打开 / 关闭
  const openRef = useRef(false);
  useEffect(() => {
    const onOpen = () => {
      // 已开着 → 只把焦点交回输入框（连续 Ctrl+P 不重复清空状态）
      if (openRef.current) {
        inputRef.current?.focus();
        return;
      }
      openRef.current = true;
      setOpen(true);
      setQuery("");
      setTab("pages");
      setTitleOnly(false);
      setScopes([]);
      setSort("relevance");
      setResults([]);
      setCursor(0);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
  }, []);

  // 打开后聚焦输入框：放在 commit 之后的 effect 里做，避免 setTimeout 与渲染赛跑
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    openRef.current = false;
    setOpen(false);
  };

  // 搜索（200ms 防抖，和侧栏旧搜索一致的手感）
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchAll(q, 40, {
        titleOnly,
        scopePageIds: scopes.length ? scopes.map((s) => s.pageId) : null,
      }).then((r) => {
        setResults(r);
        setSearching(false);
        setCursor(0);
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, titleOnly, scopes]);

  const recent = useMemo<RecentItem[]>(() => (open ? getRecentItems() : []), [open, pages.length]);

  const sorted = useMemo(() => sortSearchResults(results, sort), [results, sort]);

  // 键盘导航：↑↓ 移动光标，Enter 打开，Escape 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!sorted.length) return;
        e.preventDefault();
        setCursor((c) => {
          const next = e.key === "ArrowDown" ? c + 1 : c - 1;
          if (next < 0) return sorted.length - 1;
          if (next >= sorted.length) return 0;
          return next;
        });
        return;
      }
      if (e.key === "Enter") {
        const hit = sorted[cursor];
        if (!hit) return;
        e.preventDefault();
        openResult(hit);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sorted, cursor]);

  const openResult = (hit: SearchResult) => {
    const state = useStore.getState();
    state.openTab(hit.pageId);
    const blockId = hit.hits[0]?.blockId;
    if (blockId) {
      window.setTimeout(() => setPendingBlockFocus(blockId), 350);
    }
    close();
  };

  const askAi = () => {
    const q = query.trim();
    dispatchAiCommand({
      kind: "askPage",
      question: q || (activePage ? `关于「${activePage.title}」这篇页面，帮我梳理一下要点` : "帮我看看这个知识库里有什么"),
    });
    close();
  };

  if (!open) return null;

  return (
    <div
      className={`searchpanel${narrow ? " searchpanel--full" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("searchPanelTitle")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="searchpanel__card">
        {narrow ? (
          <div className="searchpanel__topbar">
            <button className="searchpanel__cancel" onClick={close}>
              {t("searchCancel")}
            </button>
            <div className="searchpanel__topbar-title">{t("searchTitle")}</div>
            <span className="searchpanel__topbar-spacer" />
          </div>
        ) : null}

        {/* 大输入框 */}
        <div className="searchpanel__inputrow">
          <span className="searchpanel__input-icon">
            {searching ? <span className="searchpanel__spinner" /> : <AppIcon name="search" set={iconSet} size={18} />}
          </span>
          <input
            ref={inputRef}
            className="searchpanel__input"
            value={query}
            placeholder={narrow ? t("searchPlaceholderInSpace") : t("searchPlaceholderInPages")}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("searchPlaceholderInPages")}
          />
          {query ? (
            <button className="searchpanel__clear" onClick={() => setQuery("")} title={t("searchClear")}>
              <AppIcon name="close" set={iconSet} size={14} />
            </button>
          ) : null}
        </div>

        {/* 页签行：页面 / 对话 */}
        <div className="searchpanel__tabs">
          <button
            className={`searchpanel__tab${tab === "pages" ? " searchpanel__tab--on" : ""}`}
            onClick={() => setTab("pages")}
          >
            {t("searchTabPages")}
          </button>
          <button
            className={`searchpanel__tab${tab === "chats" ? " searchpanel__tab--on" : ""}`}
            onClick={() => setTab("chats")}
          >
            {t("searchTabChats")}
          </button>
        </div>

        {tab === "chats" ? (
          /* 对话页签：观复还没有持久化的对话历史，规格本身即如此（用户账号无记录 → 近似空态） */
          <div className="searchpanel__empty">{t("searchChatsEmpty")}</div>
        ) : (
          <>
            {/* 过滤行 */}
            <div className="searchpanel__filters">
              <button
                className={`searchpanel__chip-btn${titleOnly ? " searchpanel__chip-btn--on" : ""}`}
                onClick={() => setTitleOnly((v) => !v)}
                title={t("searchTitleOnly")}
              >
                <span className="searchpanel__chip-letter">A</span>
                {t("searchTitleOnly")}
              </button>
              {/* 创建者：观复的页面表没有创建者字段 → 诚实置灰 */}
              <button className="searchpanel__chip-btn searchpanel__chip-btn--off" disabled title={t("searchByCreatorUnavailable")}>
                <AppIcon name="user" set={iconSet} size={14} />
                {t("searchByCreator")}
                <AppIcon name="chevronDown" set={iconSet} size={12} />
              </button>

              {scopes.map((sc) => (
                <span key={sc.pageId} className="searchpanel__scope">
                  <AppIcon name="file" set={iconSet} size={12} />
                  <span className="searchpanel__scope-title">{sc.title}</span>
                  <button
                    className="searchpanel__scope-x"
                    onClick={() => setScopes((list) => list.filter((x) => x.pageId !== sc.pageId))}
                    title={t("searchRemoveScope")}
                  >
                    <AppIcon name="close" set={iconSet} size={11} />
                  </button>
                </span>
              ))}

              <button
                className="searchpanel__chip-btn"
                onClick={() => {
                  // 加范围：把当前页加进去（已加则不加）
                  if (!activePage) return;
                  if (scopes.some((s) => s.pageId === activePage.id)) return;
                  setScopes((list) => [...list, { pageId: activePage.id, title: activePage.title || t("untitled") }]);
                }}
                disabled={!activePage}
                title={t("searchAddScope")}
              >
                <AppIcon name="plus" set={iconSet} size={13} />
                {t("searchAddScope")}
              </button>

              <span className="searchpanel__filters-spacer" />

              <button
                className="searchpanel__chip-btn"
                onClick={() => setSortOpen((v) => !v)}
                title={t("searchSort")}
              >
                {t("searchSort")}: {t(sortLabelKey(sort))}
                <AppIcon name="chevronDown" set={iconSet} size={12} />
              </button>
            </div>

            {sortOpen ? (
              <div className="searchpanel__sortmenu">
                {(["relevance", "updatedDesc", "updatedAsc"] as SearchSort[]).map((s) => (
                  <button
                    key={s}
                    className={`searchpanel__sortitem${s === sort ? " searchpanel__sortitem--on" : ""}`}
                    onClick={() => {
                      setSort(s);
                      setSortOpen(false);
                    }}
                  >
                    {t(sortLabelKey(s))}
                  </button>
                ))}
              </div>
            ) : null}

            {/* 列表区 */}
            <div className="searchpanel__list" ref={listRef}>
              {/* 问问 AI 行 */}
              <button className="searchpanel__airow" onClick={askAi}>
                <AppIcon name="ai" set={iconSet} size={15} />
                <span>
                  {query.trim()
                    ? t("searchAskAiWith").replace("{q}", query.trim())
                    : activePage
                      ? t("searchAskAiInPage").replace("{page}", activePage.title || t("untitled"))
                      : t("searchAskAiGeneric")}
                </span>
              </button>

              {query.trim() ? (
                sorted.length ? (
                  <>
                    <div className="searchpanel__section">
                      <span>{t("searchResults")}</span>
                      <span className="searchpanel__count">{t("searchResultCount").replace("{n}", String(sorted.length))}</span>
                    </div>
                    {sorted.map((r, i) => {
                      const hit = r.hits[0];
                      return (
                        <button
                          key={r.pageId}
                          className={`searchpanel__item${i === cursor ? " searchpanel__item--on" : ""}`}
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => openResult(r)}
                        >
                          <span className="searchpanel__item-icon">
                            <PageIconGlyph icon={pageIconOf(r.pageId)} size={15} set={iconSet} />
                          </span>
                          <span className="searchpanel__item-main">
                            <span className="searchpanel__item-title">{r.title || t("untitled")}</span>
                            {hit && hit.blockId ? (
                              <span className="searchpanel__item-snippet">
                                <Snippet text={hit.snippet} start={hit.start} end={hit.end} />
                              </span>
                            ) : null}
                          </span>
                          <span className="searchpanel__item-open">{t("searchOpen")}</span>
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="searchpanel__empty">{t("searchNoResult")}</div>
                )
              ) : (
                <>
                  <div className="searchpanel__section">
                    <span>{t("searchRecent")}</span>
                  </div>
                  {recent.length ? (
                    recent.map((item) => (
                      <button
                        key={item.pageId}
                        className="searchpanel__item"
                        onClick={() => {
                          const state = useStore.getState();
                          if (!item.deleted) state.openTab(item.pageId);
                          close();
                        }}
                      >
                        <span className="searchpanel__item-icon">
                          <PageIconGlyph icon={item.icon} size={15} set={iconSet} />
                        </span>
                        <span className="searchpanel__item-main">
                          <span className="searchpanel__item-title">{item.title}</span>
                          {item.deleted ? <span className="searchpanel__item-tag">{t("searchInTrash")}</span> : null}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="searchpanel__empty">{t("searchRecentEmpty")}</div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function sortLabelKey(sort: SearchSort): "searchSortRelevance" | "searchSortUpdatedDesc" | "searchSortUpdatedAsc" {
  if (sort === "updatedDesc") return "searchSortUpdatedDesc";
  if (sort === "updatedAsc") return "searchSortUpdatedAsc";
  return "searchSortRelevance";
}

/** 取页面图标（结果条目左侧的小图标） */
function pageIconOf(pageId: string): string | null {
  const page = useStore.getState().pages.find((p) => p.id === pageId);
  return page?.icon ?? null;
}

/** 命中片段（命中词加亮） */
function Snippet({ text, start, end }: { text: string; start: number; end: number }) {
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
