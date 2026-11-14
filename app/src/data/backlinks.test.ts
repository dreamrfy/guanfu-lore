import { describe, expect, it } from "vitest";
import { findBlockWithMention } from "./backlinks";

const mention = (pageId: string, title = "目标页") => ({
  type: "pageMention",
  props: { pageId, title },
});

describe("反向链接：找提及块", () => {
  it("在段落内联内容里找到目标页，并给出块的文字上下文", () => {
    const blocks = [
      { id: "b1", type: "paragraph", content: [{ type: "text", text: "先看 " }] },
      {
        id: "b2",
        type: "paragraph",
        content: [{ type: "text", text: "参考 " }, mention("p2"), { type: "text", text: " 里的做法" }],
      },
    ];
    const hit = findBlockWithMention(blocks, "p2");
    expect(hit?.id).toBe("b2");
    expect(hit?.text).toBe("参考 @目标页 里的做法");
  });

  it("别的页面 id 不算命中", () => {
    const blocks = [{ id: "b1", type: "paragraph", content: [mention("p9")] }];
    expect(findBlockWithMention(blocks, "p2")).toBeNull();
  });

  it("嵌套子块里也能找到", () => {
    const blocks = [
      {
        id: "b1",
        type: "bulletListItem",
        content: [{ type: "text", text: "父块" }],
        children: [{ id: "b2", type: "paragraph", content: [mention("p2", "甲")] }],
      },
    ];
    const hit = findBlockWithMention(blocks, "p2");
    expect(hit?.id).toBe("b2");
    expect(hit?.text).toBe("@甲");
  });

  it("空正文 / 非数组输入不炸", () => {
    expect(findBlockWithMention([], "p2")).toBeNull();
    expect(findBlockWithMention(null, "p2")).toBeNull();
    expect(findBlockWithMention(undefined, "p2")).toBeNull();
  });
});
