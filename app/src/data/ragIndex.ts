/**
 * 切块 + 中文友好的分词（关键词检索那一路）
 *
 * 为什么不用现成的分词库：中文检索要的是"能召回"，不是"分得完美"。
 * 这里用「单字 + 相邻二字」的方式切：既能匹配「排期」也能匹配「排」「期」，
 * 几百行的代码换来零依赖、少一个装不上的风险。
 */

export type Chunk = {
  /** 稳定编号：entity + blockId */
  id: string;
  /** page / record */
  entity: string;
  entityId: string;
  /** 块 id（用来跳回原文） */
  blockId: string;
  /** 页面/记录标题 */
  title: string;
  /** 章节标题（正文里的上一级标题） */
  heading: string;
  text: string;
  /** 命中的词（做高亮用） */
  tokens: string[];
};

const CJK = /[一-鿿㐀-䶿]/;

/** 切词：中文按字 + 二字组合，英文数字按词 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  let buffer = "";
  let prevCjk = "";

  const flushLatin = () => {
    if (buffer) {
      tokens.push(buffer);
      buffer = "";
    }
  };

  for (const ch of lower) {
    if (CJK.test(ch)) {
      flushLatin();
      tokens.push(ch);
      if (prevCjk) tokens.push(prevCjk + ch);
      prevCjk = ch;
    } else if (/[a-z0-9]/.test(ch)) {
      buffer += ch;
      prevCjk = "";
    } else {
      flushLatin();
      prevCjk = "";
    }
  }
  flushLatin();
  return tokens;
}

/** 块内容 → 纯文本（提及节点用它的标题） */
export function blockText(content: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === "string") parts.push(obj.text);
    if (obj.type === "pageMention") {
      const props = obj.props as { title?: string } | undefined;
      parts.push(props?.title ?? "");
    }
    if (Array.isArray(obj.content)) walk(obj.content);
  };
  walk(content);
  return parts.join("").trim();
}

/** 从块数组里切出可检索的段落块（跳过空块） */
export function chunkBlocks(input: {
  entity: string;
  entityId: string;
  title: string;
  blocks: unknown[];
}): Chunk[] {
  const chunks: Chunk[] = [];
  let heading = "";
  for (const raw of input.blocks) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    const type = typeof block.type === "string" ? block.type : "paragraph";
    const text = blockText(block.content);
    if (!text) continue;
    if (type === "heading") {
      heading = text;
      continue; // 标题本身当上下文，不单独成块
    }
    const blockId = typeof block.id === "string" ? block.id : `b${chunks.length}`;
    chunks.push({
      id: `${input.entity}:${input.entityId}:${blockId}`,
      entity: input.entity,
      entityId: input.entityId,
      blockId,
      title: input.title,
      heading,
      text,
      tokens: [],
    });
  }
  return chunks;
}

/* ---------------- 纯文本 → 段落块 ---------------- */

/** 把一段纯文本拆成 BlockNote 的段落块（剪藏正文、剪藏箱导入都用它） */
export function textToBlocks(text: string): Array<{
  type: string;
  content: Array<{ type: string; text: string; styles: Record<string, never> }>;
}> {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line, styles: {} as Record<string, never> }],
    }));
}

/* ---------------- BM25 ---------------- */

export type Bm25Index = {
  chunks: Chunk[];
  df: Map<string, number>;
  avgdl: number;
  total: number;
};

const K1 = 1.5;
const B = 0.75;

export function buildBm25(chunks: Chunk[]): Bm25Index {
  const df = new Map<string, number>();
  let total = 0;
  for (const chunk of chunks) {
    chunk.tokens = tokenize(`${chunk.title} ${chunk.heading} ${chunk.text}`);
    total += chunk.tokens.length;
    for (const token of new Set(chunk.tokens)) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  return { chunks, df, avgdl: chunks.length ? total / chunks.length : 0, total };
}

/** 返回 [{chunk, score}]，按分数降序 */
export function searchBm25(index: Bm25Index, query: string, limit = 20): Array<{ chunk: Chunk; score: number }> {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const N = index.chunks.length;
  if (!N) return [];

  const scored = index.chunks.map((chunk) => {
    const tf = new Map<string, number>();
    for (const token of chunk.tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    let score = 0;
    for (const token of new Set(queryTokens)) {
      const f = tf.get(token);
      if (!f) continue;
      const n = index.df.get(token) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const dl = chunk.tokens.length || 1;
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * dl) / (index.avgdl || 1))));
    }
    return { chunk, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** RRF：两路结果按排名倒数加权融合（不用调分数权重） */
export function fuseRrf(
  lists: Array<Array<{ id: string }>>,
  limit = 8,
  k = 60
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, index) => {
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
