import { describe, expect, it } from "vitest";
import { compareStrategies, evaluateRanking, formatReport, isHit, type EvalCase } from "./ragEval";
import type { Chunk } from "./ragIndex";

const chunk = (id: string, text: string): Chunk => ({
  id,
  entity: "page",
  entityId: "p1",
  blockId: id,
  title: "周报",
  heading: "",
  text,
  tokens: [],
});

const cases: EvalCase[] = [
  { question: "排期", expect: ["排期"] },
  { question: "算法", expect: ["优化算法"] },
  { question: "无解的", expect: ["根本不存在"] },
];

describe("评测：判命中", () => {
  it("标题/小标题/正文任一命中即算", () => {
    expect(isHit(chunk("a", "这周排期在周三"), ["排期"])).toBe(true);
    expect(isHit(chunk("a", "无关内容"), ["排期"])).toBe(false);
  });

  it("空片段不算命中（防止写出永远为真的用例）", () => {
    expect(isHit(chunk("a", "随便"), [""])).toBe(false);
  });
});

describe("评测：命中率与 MRR", () => {
  it("算得出 Top1/Top3 与 MRR，并列出漏掉的", () => {
    const ranked = [
      [chunk("a", "排期在周三")], // 第 1 名命中
      [chunk("x", "无关"), chunk("y", "优化算法")], // 第 2 名命中
      [chunk("z", "什么都没有")], // 没命中
    ];
    const report = evaluateRanking(ranked, cases, [1, 3, 5]);
    expect(report.hitAt[1]).toBeCloseTo(1 / 3);
    expect(report.hitAt[3]).toBeCloseTo(2 / 3);
    // MRR = (1/1 + 1/2 + 0) / 3
    expect(report.mrr).toBeCloseTo((1 + 0.5) / 3);
    expect(report.misses).toEqual(["无解的"]);
  });

  it("全命中时 MRR 为 1", () => {
    const report = evaluateRanking([[chunk("a", "排期")]], [cases[0]!], [1]);
    expect(report.mrr).toBe(1);
    expect(report.hitAt[1]).toBe(1);
  });

  it("报告能压成一行对比文本", () => {
    const report = evaluateRanking([[chunk("a", "排期")]], [cases[0]!], [1, 3]);
    expect(formatReport("BM25", report, [1, 3])).toContain("Top1 100%");
  });
});

describe("评测：多策略对比", () => {
  it("两套策略各自出报告，能量化谁更好", async () => {
    const good = {
      name: "重排后",
      retrieve: async () => [chunk("a", "排期在周三")],
    };
    const bad = {
      name: "重排前",
      retrieve: async () => [chunk("x", "无关内容")],
    };
    const reports = await compareStrategies([cases[0]!], [good, bad], [1]);
    expect(reports[0]!.report.hitAt[1]).toBe(1);
    expect(reports[1]!.report.hitAt[1]).toBe(0);
  });
});
