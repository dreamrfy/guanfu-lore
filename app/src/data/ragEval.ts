/**
 * 检索的"尺子"：评测集 + 命中率
 *
 * 为什么必须先有它：调整检索（换嵌入、加重排、改融合）如果只看"感觉好像好了"，
 * 那是在自欺。有了固定的"问题 → 应该命中哪几段"，才能回答
 * "重排到底涨了几个点、值不值得重建一次索引"。
 *
 * 判命中的方式用**关键片段**而不是块 id：块 id 会因为编辑器重新分块而变，
 * 写死 id 的评测集过两周就全失效；写"该命中的那段里必然出现的字"更耐用。
 */
import type { Chunk } from "./ragIndex";

export type EvalCase = {
  /** 问什么 */
  question: string;
  /** 正确答案里必然出现的片段（命中任一即算命中这一段） */
  expect: string[];
  /** 这条用例是哪来的（便于以后回溯；比如"真实使用中漏掉的"） */
  note?: string;
};

export type EvalReport = {
  total: number;
  /** k → 命中率（0~1） */
  hitAt: Record<number, number>;
  /** 平均倒数排名：越接近 1 说明正确答案排得越前 */
  mrr: number;
  /** 完全没命中的用例（最该看的部分） */
  misses: string[];
};

export const DEFAULT_KS = [1, 3, 5] as const;

export function isHit(chunk: Chunk, expect: string[]): boolean {
  const haystack = `${chunk.title}\n${chunk.heading}\n${chunk.text}`;
  return expect.some((needle) => needle && haystack.includes(needle));
}

/**
 * 用"每个问题的排名结果"算命中率。
 * ranked[i] = 第 i 个问题检索出来的段落顺序（已排好序）。
 */
export function evaluateRanking(
  ranked: Chunk[][],
  cases: EvalCase[],
  ks: readonly number[] = DEFAULT_KS
): EvalReport {
  const hitAt: Record<number, number> = {};
  for (const k of ks) hitAt[k] = 0;
  let reciprocalSum = 0;
  const misses: string[] = [];

  cases.forEach((evalCase, index) => {
    const list = ranked[index] ?? [];
    const rank = list.findIndex((chunk) => isHit(chunk, evalCase.expect));
    for (const k of ks) {
      if (rank >= 0 && rank < k) hitAt[k] = (hitAt[k] ?? 0) + 1;
    }
    if (rank >= 0) reciprocalSum += 1 / (rank + 1);
    else misses.push(evalCase.question);
  });

  const total = cases.length || 1;
  const normalized: Record<number, number> = {};
  for (const k of ks) normalized[k] = (hitAt[k] ?? 0) / total;
  return { total: cases.length, hitAt: normalized, mrr: reciprocalSum / total, misses };
}

/** 把报告压成一行，方便对比两种策略 */
export function formatReport(name: string, report: EvalReport, ks: readonly number[] = DEFAULT_KS): string {
  const parts = ks.map((k) => `Top${k} ${(report.hitAt[k]! * 100).toFixed(0)}%`);
  return `${name}：${parts.join(" · ")} · MRR ${report.mrr.toFixed(3)}（共 ${report.total} 条）`;
}

export type Strategy = { name: string; retrieve: (question: string) => Promise<Chunk[]> };

/** 跑多套策略、出对比报告 */
export async function compareStrategies(
  cases: EvalCase[],
  strategies: Strategy[],
  ks: readonly number[] = DEFAULT_KS
): Promise<Array<{ name: string; report: EvalReport; text: string }>> {
  const out: Array<{ name: string; report: EvalReport; text: string }> = [];
  for (const strategy of strategies) {
    const ranked: Chunk[][] = [];
    for (const evalCase of cases) {
      ranked.push(await strategy.retrieve(evalCase.question));
    }
    const report = evaluateRanking(ranked, cases, ks);
    out.push({ name: strategy.name, report, text: formatReport(strategy.name, report, ks) });
  }
  return out;
}

/** 内置的一小组演示用例（用来自测这条链路是通的；真实用例应该来自你自己的库） */
export const DEMO_CASES: EvalCase[] = [
  { question: "排期定在什么时候", expect: ["排期", "周三"], note: "同词命中，考察关键词那一路" },
  { question: "怎么让程序更聪明", expect: ["优化算法"], note: "换说法，考察语义那一路" },
  { question: "验收口径", expect: ["验收口径"], note: "专有名词" },
];
