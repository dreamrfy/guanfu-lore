/**
 * 页面提及（@页面）
 *
 * 用 BlockNote 官方的「自定义内联内容」扩展点，不改它的源码。
 * 文档里只存 pageId + 当时的标题：
 *  - pageId 是打开页面的依据（标题改了也不影响）
 *  - title 是展示快照（页面被删后仍能看出当时提的是谁）
 * 反向链接就是反过来扫这个节点，见 backlinks.ts。
 */
import { createReactInlineContentSpec } from "@blocknote/react";
import { useStore } from "../../data/store";

export const PageMention = createReactInlineContentSpec(
  {
    type: "pageMention",
    propSchema: {
      pageId: { default: "" },
      title: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: ({ inlineContent }) => {
      const pageId = inlineContent.props.pageId;
      const title = inlineContent.props.title || "未命名页面";
      return (
        <span
          className="page-mention"
          data-page-id={pageId}
          contentEditable={false}
          title="点击打开这一页"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (pageId) useStore.getState().openTab(pageId);
          }}
        >
          <span className="page-mention__at">@</span>
          {title}
        </span>
      );
    },
    toExternalHTML: ({ inlineContent }) => (
      <span>@{inlineContent.props.title || "未命名页面"}</span>
    ),
  }
);
