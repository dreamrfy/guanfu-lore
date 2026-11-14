/**
 * 重排（rerank）客户端
 *
 * 为什么需要它：粗召回（关键词 + 向量）为了不漏，会抓回二三十条；
 * 但"哪几条真能回答问题"，只有把**问题和段落拼在一起**看过才准
 * （交叉编码器 / cross-encoder）。它比向量准，代价是慢——所以只处理那二三十条。
 *
 * 接口形态：主流平台（硅基流动 / Jina / Cohere / Voyage）都是
 *   POST {base}/rerank  { model, query, documents: string[], top_n }
 *   → { results: [{ index, relevance_score }] }
 * 一个实现覆盖大多数；不认识的返回结构会**明确报错**，不猜。
 *
 * 没配 rerank 时：返回原顺序，检索照常可用（功能不残废）。
 */
import { repo } from "./db";

export type RerankConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const RERANK_KEY = "ragRerank";

export const DEFAULT_RERANK_CONFIG: RerankConfig = {
  baseUrl: "https://api.siliconflow.cn/v1",
  apiKey: "",
  model: "BAAI/bge-reranker-v2-m3",
};

export async function loadRerankConfig(): Promise<RerankConfig> {
  const raw = await repo.getMeta<Partial<RerankConfig>>(RERANK_KEY);
  if (!raw || typeof raw !== "object") return DEFAULT_RERANK_CONFIG;
  return { ...DEFAULT_RERANK_CONFIG, ...raw };
}

export async function saveRerankConfig(config: RerankConfig): Promise<void> {
  await repo.setMeta(RERANK_KEY, {
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  });
}

export function isRerankConfigured(config: RerankConfig): boolean {
  return Boolean(config.apiKey.trim() && config.model.trim() && config.baseUrl.trim());
}

/** 端点：平台的 rerank 路径不统一，这里按最常见的两种候选拼装 */
export function rerankEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return base.endsWith("/rerank") ? base : `${base}/rerank`;
}

export type RerankOutcome = {
  ok: boolean;
  /** 重排后的下标顺序（按相关度降序） */
  order: number[];
  scores: number[];
  error?: string;
};

export function parseRerankResponse(data: unknown): { order: number[]; scores: number[] } | null {
  const results = (data as { results?: unknown })?.results;
  if (!Array.isArray(results)) return null;
  const parsed: Array<{ index: number; score: number }> = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const index = typeof obj.index === "number" ? obj.index : NaN;
    const score =
      typeof obj.relevance_score === "number"
        ? obj.relevance_score
        : typeof obj.score === "number"
          ? obj.score
          : NaN;
    if (Number.isFinite(index) && Number.isFinite(score)) parsed.push({ index, score });
  }
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => b.score - a.score);
  return { order: parsed.map((p) => p.index), scores: parsed.map((p) => p.score) };
}

/**
 * 对候选做重排。任何失败都返回 ok:false 且**保持原顺序**——
 * 重排是"锦上添花"，它坏了不该让检索整体失败。
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  config: RerankConfig
): Promise<RerankOutcome> {
  const identity = { order: documents.map((_, i) => i), scores: [] as number[] };
  if (!isRerankConfigured(config) || documents.length === 0) {
    return { ok: false, ...identity, error: "未配置重排模型" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(rerankEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        query,
        documents,
        top_n: documents.length,
        return_documents: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, ...identity, error: `重排服务返回 ${res.status}${detail ? `：${detail.slice(0, 120)}` : ""}` };
    }
    const data = await res.json();
    const parsed = parseRerankResponse(data);
    if (!parsed) {
      return { ok: false, ...identity, error: "重排服务返回的结构不认识（没有 results[].index/relevance_score）" };
    }
    // 只保留合法下标，别的丢掉（防止平台多返回）
    const valid = parsed.order.filter((i) => i >= 0 && i < documents.length);
    return { ok: true, order: valid, scores: parsed.scores.slice(0, valid.length) };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return { ok: false, ...identity, error: aborted ? "重排超时（30 秒）" : "连不上重排服务" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 用重排结果重排数组。重排没生效（未配置/失败）时返回原数组——
 * 调用方不用写分支。
 */
export async function rerankList<T>(
  query: string,
  items: T[],
  toText: (item: T) => string,
  config: RerankConfig
): Promise<{ items: T[]; reranked: boolean; error?: string }> {
  if (items.length <= 1) return { items, reranked: false };
  const outcome = await rerankDocuments(query, items.map(toText), config);
  if (!outcome.ok || outcome.order.length === 0) {
    return { items, reranked: false, error: outcome.error };
  }
  const ordered: T[] = [];
  for (const i of outcome.order) {
    const item = items[i];
    if (item !== undefined) ordered.push(item);
  }
  // 重排只给部分结果时，剩下的按原顺序接在后面
  const missing = items.filter((item) => !ordered.includes(item));
  return { items: [...ordered, ...missing], reranked: true };
}
