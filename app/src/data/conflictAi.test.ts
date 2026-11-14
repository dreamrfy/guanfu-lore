import { describe, expect, it } from "vitest";
import {
  applyMergedBlocks,
  buildJudgeMessages,
  diffBlocks,
  hasSameSpotChange,
  mergeByDiff,
  mergePayloadBlocks,
  parseJudge,
  payloadBlocks,
  type LiteBlock,
} from "./conflictAi";

const server: LiteBlock[] = [
  { id: "b1", text: "排期定在周三" },
  { id: "b2", text: "验收口径未定" },
];

const mine: LiteBlock[] = [
  { id: "b1", text: "排期定在周三" },
  { id: "b2", text: "验收口径定在周五" },
  { id: "b3", text: "新增一条风险" },
];

describe("冲突辅助：payload 形状", () => {
  it("正文块放在顶层时也能取出", () => {
    const blocks = payloadBlocks({
      page: { id: "p1", title: "标题" },
      blocks: [{ id: "b1", content: [{ type: "text", text: "内容" }] }],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks![0]!.text).toBe("内容");
  });

  it("正文块放在 page.blocks 里也能取出", () => {
    const blocks = payloadBlocks({
      page: { id: "p1", blocks: [{ id: "b1", content: [{ type: "text", text: "内容" }] }] },
    });
    expect(blocks).toHaveLength(1);
  });

  it("合并结果写回原来的位置（顶层 blocks）", () => {
    const out = applyMergedBlocks(
      { page: { id: "p1" }, blocks: [{ id: "b1", content: [{ type: "text", text: "旧" }] }] },
      [{ id: "b1", text: "新" }]
    ) as { blocks: Array<{ content: Array<{ text: string }> }> };
    expect(out.blocks[0]!.content[0]!.text).toBe("新");
  });
});

describe("冲突辅助：合并 payload", () => {
  it("我的新增块要真的进到合并结果里（不只是改文字）", () => {
    const serverPayload = {
      page: { id: "p1", title: "标题" },
      blocks: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "服务器那段" }] }],
    };
    const myPayload = {
      page: { id: "p1", title: "标题" },
      blocks: [
        { id: "b1", type: "paragraph", content: [{ type: "text", text: "服务器那段" }] },
        { id: "b2", type: "paragraph", content: [{ type: "text", text: "我新增的那段" }] },
      ],
    };
    const merged = mergePayloadBlocks(serverPayload, myPayload) as {
      blocks: Array<{ id: string; content: Array<{ text: string }> }>;
    };
    expect(merged.blocks).toHaveLength(2);
    expect(merged.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(merged.blocks[1]!.content[0]!.text).toBe("我新增的那段");
  });
});

describe("冲突辅助：差异对比", () => {
  it("同一 id 不同文字 → 判成「同一处」", () => {
    const diff = diffBlocks(server, mine);
    const changed = diff.find((d) => d.kind === "changed");
    expect(changed?.id).toBe("b2");
    expect(changed?.otherText).toBe("验收口径定在周五");
    expect(hasSameSpotChange(diff)).toBe(true);
  });

  it("只多了一段 → 判成「仅我有」，不算同一处", () => {
    const diff = diffBlocks(server, [{ ...server[0]! }, { ...server[1]! }, { id: "b3", text: "新增" }]);
    expect(diff.some((d) => d.kind === "mineOnly")).toBe(true);
    expect(hasSameSpotChange(diff)).toBe(false);
  });

  it("完全一致 → 没有差异", () => {
    const diff = diffBlocks(server, server);
    expect(diff.every((d) => d.kind === "same")).toBe(true);
    expect(hasSameSpotChange(diff)).toBe(false);
  });
});

describe("冲突辅助：合并", () => {
  it("不是同一处时：服务器的编辑 + 我的新增都在", () => {
    const myOnly = [
      { id: "b1", text: "排期定在周三" },
      { id: "b2", text: "验收口径未定" },
      { id: "b3", text: "新增一条风险" },
    ];
    const diff = diffBlocks(server, myOnly);
    const merged = mergeByDiff(server, myOnly, diff);
    expect(merged.map((b) => b.text)).toContain("新增一条风险");
    expect(merged.map((b) => b.text)).toContain("验收口径未定");
  });

  it("同一处被改过时，合并结果要保留服务器那份（不静默采纳我的）", () => {
    const diff = diffBlocks(server, mine);
    const merged = mergeByDiff(server, mine, diff);
    expect(merged.map((b) => b.text)).toContain("验收口径未定");
    expect(merged.map((b) => b.text)).not.toContain("验收口径定在周五");
  });
});

describe("冲突辅助：判定解析", () => {
  it("能解析带 ```json 包裹的回复", () => {
    const verdict = parseJudge('```json\n{"sameSpot":false,"reason":"改的是不同段","merged":"合并后"}\n```');
    expect(verdict?.sameSpot).toBe(false);
    expect(verdict?.merged).toBe("合并后");
  });

  it("解析不了就返回 null（不硬猜）", () => {
    expect(parseJudge("我看了一下，两边改的不是同一处")).toBeNull();
  });
});

describe("冲突辅助：判定提示词", () => {
  it("把差异标签和两版内容都放进提示词", () => {
    const diff = diffBlocks(server, mine);
    const messages = buildJudgeMessages(server, mine, diff);
    expect(messages[0]!.content).toContain("JSON");
    expect(messages[1]!.content).toContain("同一处被两边改成了不同文字");
    expect(messages[1]!.content).toContain("验收口径未定");
  });
});
