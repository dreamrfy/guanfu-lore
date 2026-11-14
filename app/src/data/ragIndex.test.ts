import { describe, expect, it } from "vitest";
import {
  blockText,
  buildBm25,
  chunkBlocks,
  fuseRrf,
  searchBm25,
  tokenize,
} from "./ragIndex";

describe("检索：中文分词", () => {
  it("中文出单字 + 相邻二字，英文出小写词", () => {
    const tokens = tokenize("排期 AI 计划");
    expect(tokens).toContain("排");
    expect(tokens).toContain("期");
    expect(tokens).toContain("排期");
    expect(tokens).toContain("ai");
    expect(tokens).toContain("计划");
  });

  it("块里的提及节点用它的标题", () => {
    const text = blockText([
      { type: "text", text: "看 " },
      { type: "pageMention", props: { title: "项目计划" } },
    ]);
    expect(text).toContain("项目计划");
  });
});

describe("检索：切块", () => {
  const blocks = [
    { id: "b1", type: "heading", content: [{ type: "text", text: "第一章" }] },
    { id: "b2", type: "paragraph", content: [{ type: "text", text: "这周要排期" }] },
    { id: "b3", type: "paragraph", content: [{ type: "text", text: "   " }] },
    { id: "b4", type: "paragraph", content: [{ type: "text", text: "验收口径未定" }] },
  ];

  it("标题进上下文、空块跳过", () => {
    const chunks = chunkBlocks({ entity: "page", entityId: "p1", title: "周报", blocks });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.heading).toBe("第一章");
    expect(chunks[0]!.title).toBe("周报");
    expect(chunks[0]!.blockId).toBe("b2");
  });
});

describe("检索：BM25", () => {
  const chunks = chunkBlocks({
    entity: "page",
    entityId: "p1",
    title: "项目计划",
    blocks: [
      { id: "b1", type: "paragraph", content: [{ type: "text", text: "这周要排期，周三给方案" }] },
      { id: "b2", type: "paragraph", content: [{ type: "text", text: "验收口径还没定" }] },
    ],
  });

  it("命中词的段落排在前面", () => {
    const index = buildBm25(chunks);
    const hits = searchBm25(index, "排期");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.chunk.text).toContain("排期");
  });

  it("查不到时不硬凑结果", () => {
    const index = buildBm25(chunks);
    expect(searchBm25(index, "完全无关的词xyz")).toHaveLength(0);
  });
});

describe("检索：RRF 融合", () => {
  it("两路都命中的排最前", () => {
    const fused = fuseRrf(
      [
        [{ id: "a" }, { id: "b" }],
        [{ id: "b" }, { id: "c" }],
      ],
      3
    );
    expect(fused[0]!.id).toBe("b");
    expect(fused).toHaveLength(3);
  });
});
