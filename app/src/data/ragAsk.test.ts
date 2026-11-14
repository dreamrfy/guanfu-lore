import { describe, expect, it } from "vitest";
import { buildAskMessages, buildCitations } from "./ragAsk";
import type { Chunk } from "./ragIndex";

const chunk = (over: Partial<Chunk> = {}): Chunk => ({
  id: "page:p1:b1",
  entity: "page",
  entityId: "p1",
  blockId: "b1",
  title: "周报",
  heading: "第一章",
  text: "这周要排期",
  tokens: [],
  ...over,
});

describe("问答：提示词", () => {
  it("严格模式要求找不到就说没有", () => {
    const messages = buildAskMessages("排期什么时候", [chunk()], true);
    expect(messages[0]!.content).toContain("找不到");
    expect(messages[0]!.content).toContain("不要编造");
  });

  it("宽松模式允许补充但要标注", () => {
    const messages = buildAskMessages("排期什么时候", [chunk()], false);
    expect(messages[0]!.content).toContain("资料外推测");
  });

  it("资料带编号，能对上答案里的 [1]", () => {
    const messages = buildAskMessages("排期", [chunk(), chunk({ id: "page:p1:b2", blockId: "b2" })], true);
    expect(messages[1]!.content).toContain("[1]");
    expect(messages[1]!.content).toContain("[2]");
    expect(messages[1]!.content).toContain("这周要排期");
  });
});

describe("问答：出处", () => {
  it("编号从 1 开始，带上标题与块 id", () => {
    const citations = buildCitations([chunk(), chunk({ id: "page:p1:b2", blockId: "b2" })]);
    expect(citations).toHaveLength(2);
    expect(citations[0]!.index).toBe(1);
    expect(citations[1]!.index).toBe(2);
    expect(citations[0]!.blockId).toBe("b1");
    expect(citations[0]!.title).toBe("周报");
  });
});
