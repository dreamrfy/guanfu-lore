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

describe("反向链接：全库扫描（W29）", () => {
  it("页面 B 正文提及 A → A 的反链里有 B；A 自己不计入", async () => {
    const { findBacklinks } = await import("./backlinks");
    const { useStore } = await import("./store");
    const row = (id: string, title: string) =>
      ({ id, parentId: null, title, icon: null, createdAt: 1, updatedAt: 1, deletedAt: null, sortKey: 1 }) as never;
    useStore.setState({
      pages: [row("a", "甲页"), row("b", "乙页")] as never,
      docs: {
        a: [{ id: "a1", type: "paragraph", content: [mention("a", "甲页")] }],
        b: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "见 " }, mention("a", "甲页")] }],
      } as never,
    });

    const out = await findBacklinks("a");
    expect(out.map((x) => x.pageId)).toEqual(["b"]);
    expect(out[0].title).toBe("乙页");
    expect(out[0].snippet).toContain("@甲页");
  });
});
