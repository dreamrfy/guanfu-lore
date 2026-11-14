/**
 * 问知识库（决策 D5：BM25 + 向量混合，RRF 融合）
 *
 * 两路检索：
 *  - 关键词（本地 BM25，零成本、找专有名词/数字准）
 *  - 向量（云端 embedding，换个说法也能命中）
 * 两路结果用 RRF 按排名倒数融合——不用调"分数权重"这种玄学参数。
 *
 * 没配 embedding Key 时自动退化成纯关键词，功能不残废。
 */
import { repo } from "./db";
import { buildBm25, chunkBlocks, fuseRrf, searchBm25, type Chunk } from "./ragIndex";
import { cosine, embedTexts, loadEmbedConfig, type EmbedConfig } from "./ragEmbed";
import { loadRerankConfig, rerankList } from "./rerank";
import { buildAskMessages, buildCitations, type Citation } from "./ragAsk";
import { chat, loadAiConfig } from "./ai";
import { useStore } from "./store";

/** 文本指纹（变了就重新向量化） */
function hashOf(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** 记录标题：第一个文本字段的值 */
function recordTitle(collectionId: string, values: Record<string, unknown>): string {
  const state = useStore.getState();
  const collection = state.collections.find((c) => c.id === collectionId);
  const field = collection?.fields.find((f) => f.type === "text");
  if (!field) return collection?.name ?? "记录";
  return String(values[field.id] ?? "") || collection?.name || "记录";
}

/** 收集全库可检索段落：页面正文 + 剪藏记录正文 */
export function collectChunks(): Chunk[] {
  const state = useStore.getState();
  const chunks: Chunk[] = [];

  for (const page of state.pages) {
    const blocks = (state.docs[page.id] as unknown[]) ?? [];
    chunks.push(
      ...chunkBlocks({
        entity: "page",
        entityId: page.id,
        title: page.title || "无标题",
        blocks,
      })
    );
  }

  for (const [collectionId, records] of Object.entries(state.records)) {
    for (const record of records) {
      chunks.push(
        ...chunkBlocks({
          entity: "record",
          entityId: record.id,
          title: recordTitle(collectionId, record.values ?? {}),
          blocks: (record.doc as unknown[]) ?? [],
        })
      );
    }
  }

  return chunks;
}

/** 给缺向量/过期的段落补向量 */
export async function ensureVectors(chunks: Chunk[], config: EmbedConfig): Promise<void> {
  const stored = new Map((await repo.listRagVectors()).map((v) => [v.chunkId, v]));
  const need = chunks.filter((chunk) => {
    const row = stored.get(chunk.id);
    return !row || row.hash !== hashOf(chunk.text);
  });
  if (need.length === 0) return;

  const vectors = await embedTexts(
    need.map((chunk) => chunk.text),
    config
  );
  if (!vectors) return;

  for (let i = 0; i < need.length; i++) {
    const chunk = need[i]!;
    const vec = vectors[i]!;
    await repo.putRagVector({
      chunkId: chunk.id,
      entity: chunk.entity,
      entityId: chunk.entityId,
      blockId: chunk.blockId,
      hash: hashOf(chunk.text),
      dim: vec.length,
      vec: vec.buffer.slice(vec.byteOffset, vec.byteOffset + vec.byteLength) as ArrayBuffer,
      updatedAt: Date.now(),
    });
  }
}

/** 混合检索：返回最相关的若干段落 */
export async function searchKnowledge(query: string, limit = 8): Promise<Chunk[]> {
  const chunks = collectChunks();
  if (chunks.length === 0) return [];

  const index = buildBm25(chunks);
  const keywordHits = searchBm25(index, query, 20);

  const semanticHits: Array<{ id: string; score: number }> = [];
  const config = await loadEmbedConfig();
  if (config.apiKey.trim()) {
    await ensureVectors(chunks, config);
    const queryVec = (await embedTexts([query], config))?.[0];
    if (queryVec) {
      const alive = new Set(chunks.map((c) => c.id));
      const rows = (await repo.listRagVectors()).filter((v) => alive.has(v.chunkId));
      semanticHits.push(
        ...rows
          .map((row) => ({
            id: row.chunkId,
            score: cosine(queryVec, new Float32Array(row.vec)),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
      );
    }
  }

  const fused = fuseRrf(
    [keywordHits.map((hit) => ({ id: hit.chunk.id })), semanticHits],
    limit
  );
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const candidates = fused.map((item) => byId.get(item.id)).filter((chunk): chunk is Chunk => !!chunk);

  // 精排：粗召回为了不漏会多抓，这里把"真正回答了这个问题的"挑到前面。
  // 没配重排 / 重排失败 → 原顺序返回（重排是锦上添花，坏了不该让检索失败）。
  const rerankConfig = await loadRerankConfig();
  const reranked = await rerankList(
    query,
    candidates,
    (chunk) => `${chunk.heading ? chunk.heading + " " : ""}${chunk.text}`,
    rerankConfig
  );
  return reranked.items;
}

export type AskResult = {
  ok: boolean;
  answer?: string;
  citations?: Citation[];
  error?: string;
};

/** 问知识库：检索 → 组提示词 → 调模型 */
export async function askKnowledgeBase(question: string, strict: boolean): Promise<AskResult> {
  const chunks = await searchKnowledge(question, 6);
  if (chunks.length === 0) {
    return {
      ok: true,
      answer: strict
        ? "知识库里没有找到相关内容。"
        : "知识库里没有找到相关内容。可以换个说法再问，或者先把相关资料剪藏进来。",
      citations: [],
    };
  }

  const config = await loadAiConfig();
  if (!config) return { ok: false, error: "还没配置 AI 供应商（右侧 AI 面板里填一下）" };

  const result = await chat(buildAskMessages(question, chunks, strict), config);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, answer: result.text, citations: buildCitations(chunks) };
}
