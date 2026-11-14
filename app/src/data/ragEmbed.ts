/**
 * 向量化（embedding）客户端
 *
 * 为什么不引 SDK：OpenAI 兼容的 `/v1/embeddings` 就一个请求，
 * 手写能同时兼容硅基流动 / OpenAI / 本地 Ollama。
 *
 * 没配 Key 也能用：检索会退化成纯关键词那一路（BM25），功能不残废。
 */
import { repo } from "./db";

export type EmbedConfig = {
  /** 例如 https://api.siliconflow.cn/v1 */
  baseUrl: string;
  apiKey: string;
  /** 例如 BAAI/bge-m3 */
  model: string;
};

const EMBED_KEY = "ragEmbedding";

export const DEFAULT_EMBED_CONFIG: EmbedConfig = {
  baseUrl: "https://api.siliconflow.cn/v1",
  apiKey: "",
  model: "BAAI/bge-m3",
};

export async function loadEmbedConfig(): Promise<EmbedConfig> {
  const raw = await repo.getMeta<Partial<EmbedConfig>>(EMBED_KEY);
  if (!raw || typeof raw !== "object") return DEFAULT_EMBED_CONFIG;
  return { ...DEFAULT_EMBED_CONFIG, ...raw };
}

export async function saveEmbedConfig(config: EmbedConfig): Promise<void> {
  await repo.setMeta(EMBED_KEY, {
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  });
}

/** 一次最多送多少段（超了分批） */
const BATCH = 16;

/**
 * 把文本转成向量。返回 null 表示"没配置/调用失败"——调用方据此退化成纯关键词检索。
 */
export async function embedTexts(
  texts: string[],
  config: EmbedConfig
): Promise<Float32Array[] | null> {
  if (!config.apiKey.trim() || !config.model.trim()) return null;
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    try {
      const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          input: slice,
          encoding_format: "float",
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
      const list = data.data ?? [];
      if (list.length !== slice.length) return null;
      for (const item of list) {
        const vec = item.embedding;
        if (!Array.isArray(vec) || vec.length === 0) return null;
        out.push(Float32Array.from(vec));
      }
    } catch {
      return null;
    }
  }
  return out;
}

/** 余弦相似度（向量已归一化时等价于点积） */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
