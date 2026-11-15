import { useEffect, useRef, useState } from "react";
import { collectTags, pagesWithTag } from "../data/pageTags";
import { useStore } from "../data/store";

/**
 * 侧栏底部的「标签」统一面板（M02）：
 *  - 所有标签 + 计数一览（软删页不计入）
 *  - 点标签 = 跨页检索：列出打了该标签的全部活页（新→旧），点页面直接打开
 */
export function TagPanel() {
  const pages = useStore((s) => s.pages);
  const openTab = useStore((s) => s.openTab);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const stats = collectTags(pages);
  const hits = active ? pagesWithTag(pages, active) : [];

  return (
    <div className="tagpanel" ref={ref}>
      <button
        className="icon-btn"
        style={{ width: "100%", justifyContent: "flex-start" }}
        onClick={() => {
          setOpen((v) => !v);
          setActive(null);
        }}
      >
        ＃ 标签{stats.length > 0 ? `（${stats.length}）` : ""}
      </button>

      {open && (
        <div className="tagpanel__pop">
          {stats.length === 0 && <div className="tagpanel__empty">还没有标签。在页面标题下方输入即可打标签。</div>}
          <div className="tagpanel__tags">
            {stats.map(({ tag, count }) => (
              <button
                key={tag}
                className={"tagpanel__tag" + (tag === active ? " tagpanel__tag--on" : "")}
                title={`看打了「${tag}」的页面`}
                onClick={() => setActive(tag === active ? null : tag)}
              >
                {tag}
                <span className="tagpanel__count">{count}</span>
              </button>
            ))}
          </div>
          {active && (
            <div className="tagpanel__hits">
              <div className="tagpanel__hits-title">「{active}」· {hits.length} 页</div>
              {hits.length === 0 && <div className="tagpanel__empty">没有页面用这个标签</div>}
              {hits.map((p) => (
                <button
                  key={p.id}
                  className="tagpanel__page"
                  onClick={() => {
                    openTab(p.id);
                    setOpen(false);
                  }}
                >
                  <span>{p.icon ?? "📄"}</span>
                  <span className="tagpanel__pagename">{p.title || "无标题"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
