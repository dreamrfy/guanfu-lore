import { useState } from "react";
import { useStore } from "../data/store";

/**
 * 页头标签条（M02）：当前页的标签 chips + 回车新增。
 * 数据走 store.setPageTags（归一去重 + 出同步箱），标签删光后输入框仍在，随时可再打。
 */
export function TagBar({ pageId }: { pageId: string }) {
  const tags = useStore((s) => s.pages.find((p) => p.id === pageId)?.tags ?? []);
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
