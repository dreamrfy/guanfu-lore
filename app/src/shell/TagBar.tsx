import { useState } from "react";
import { useStore } from "../data/store";

// 无标签时的稳定空引用：选择器里 ?? [] 每次都造新数组，会把 useSyncExternalStore
// 打进"快照永远在变"的无限重渲染（M03 走查逮到，单测测不出来——不渲染 React）。
const NO_TAGS: string[] = [];

/**
 * 页头标签条（M02）：当前页的标签 chips + 回车新增。
 * 数据走 store.setPageTags（归一去重 + 出同步箱），标签删光后输入框仍在，随时可再打。
 */
export function TagBar({ pageId }: { pageId: string }) {
  const tags = useStore((s) => s.pages.find((p) => p.id === pageId)?.tags) ?? NO_TAGS;
  const setPageTags = useStore((s) => s.setPageTags);
  const [draft, setDraft] = useState("");

  const add = () => {
    if (draft.trim()) setPageTags(pageId, [...tags, draft]);
    setDraft("");
  };

  return (
    <div className="ptagbar">
      {tags.map((t) => (
        <span className="ptagbar__chip" key={t}>
          {t}
          <button
            className="ptagbar__chip-x"
            title={`移除标签「${t}」`}
            onClick={() => setPageTags(pageId, tags.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="ptagbar__input"
        value={draft}
        placeholder="＋ 标签"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
        onBlur={add}
      />
    </div>
  );
}
