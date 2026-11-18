/**
 * 页面块 / 引用页面块（W53）
 *
 * 07 §1 基础块里的「页面（/ym）」与「引用页面（/yyym）」：
 *  - 页面：在当前位置建一个子页面，并显示为可点击的页面卡片；
 *  - 引用页面：从现有页面里挑一个，显示为可点击的引用卡片。
 * 用同一个自定义块承载，`mode` 区分；标题不存快照而是实时从 store 取，
 * 这样改名后卡片跟着变（比存快照更不容易过期）。
 */
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { useStore } from "../../data/store";

export const PageBlock = createReactBlockSpec(
  {
    type: "pageBlock",
    propSchema: {
      ...defaultProps,
      pageId: { default: "" },
      mode: { default: "ref" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const pageId = block.props.pageId as string;
      const mode = (block.props.mode as string) || "ref";
      const pages = useStore((s) => s.pages);
      const openTab = useStore((s) => s.openTab);
      const live = pages.find((p) => p.id === pageId);

      if (pageId && live) {
        return (
          <div
            className="pageblock"
            contentEditable={false}
            title="打开这一页"
            onClick={() => openTab(live.id)}
          >
            <span className="pageblock__icon">{live.icon ?? "📄"}</span>
            <span className="pageblock__title">{live.title || "无标题"}</span>
            <span className="pageblock__hint">打开</span>
          </div>
        );
      }

      if (mode === "new") {
        return (
          <div className="pageblock pageblock--empty" contentEditable={false}>
            <button
              className="pageblock__btn"
              onClick={async () => {
                const parentId = useStore.getState().activeTabId;
                // open:false —— 在正文里建子页时不能把当前页切走，否则编辑器重挂载、块更新丢失
                const id = await useStore.getState().createPage(parentId, [], { open: false });
                editor.updateBlock(block, { props: { pageId: id } } as never);
              }}
            >
              ＋ 新建子页面
            </button>
            <span className="pageblock__hint">在当前页面下建一页</span>
          </div>
        );
      }

      return (
        <div className="pageblock pageblock--empty" contentEditable={false}>
          <select
            className="pageblock__select"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) editor.updateBlock(block, { props: { pageId: id } } as never);
            }}
          >
            <option value="">选择要引用的页面…</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || "无标题"}
              </option>
            ))}
          </select>
        </div>
      );
    },
  }
);