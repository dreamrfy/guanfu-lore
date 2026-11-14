import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRerankConfigured,
  parseRerankResponse,
  rerankEndpoint,
  rerankList,
  type RerankConfig,
} from "./rerank";

const config: RerankConfig = {
  baseUrl: "https://api.siliconflow.cn/v1",
  apiKey: "k",
  model: "BAAI/bge-reranker-v2-m3",
};

afterEach(() => vi.unstubAllGlobals());

describe("重排：端点与配置", () => {
  it("补 /rerank，已写全则不重复拼", () => {
    expect(rerankEndpoint("https://x/v1")).toBe("https://x/v1/rerank");
    expect(rerankEndpoint("https://x/v1/rerank")).toBe("https://x/v1/rerank");
    expect(rerankEndpoint("https://x/v1/")).toBe("https://x/v1/rerank");
  });

  it("没填 key 视为未配置", () => {
    expect(isRerankConfigured(config)).toBe(true);
    expect(isRerankConfigured({ ...config, apiKey: "" })).toBe(false);
  });
});

describe("重排：响应解析", () => {
  it("认 relevance_score 与 score 两种字段", () => {
    const a = parseRerankResponse({ results: [{ index: 2, relevance_score: 0.9 }, { index: 0, relevance_score: 0.3 }] });
    expect(a?.order).toEqual([2, 0]);
    const b = parseRerankResponse({ results: [{ index: 1, score: 5 }, { index: 0, score: 9 }] });
    expect(b?.order).toEqual([0, 1]);
  });

  it("结构不认识时返回 null（不猜）", () => {
    expect(parseRerankResponse({ data: [] })).toBeNull();
    expect(parseRerankResponse(null)).toBeNull();
    expect(parseRerankResponse({ results: [{ foo: 1 }] })).toBeNull();
  });
});

describe("重排：调用与降级", () => {
  it("按平台返回的顺序重排", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ results: [{ index: 2, relevance_score: 0.99 }, { index: 0, relevance_score: 0.5 }, { index: 1, relevance_score: 0.1 }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    const items = ["第一段", "第二段", "第三段"];
    const result = await rerankList("问题", items, (s) => s, config);
    expect(result.reranked).toBe(true);
    expect(result.items).toEqual(["第三段", "第一段", "第二段"]);
  });

  it("没配置时保持原顺序，且不报错", async () => {
    const items = ["甲", "乙"];
    const result = await rerankList("问题", items, (s) => s, { ...config, apiKey: "" });
    expect(result.reranked).toBe(false);
    expect(result.items).toEqual(items);
  });

  it("服务报错时降级为原顺序（检索不因此失败）", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("boom", { status: 500 })));
    const result = await rerankList("问题", ["甲", "乙"], (s) => s, config);
    expect(result.reranked).toBe(false);
    expect(result.items).toEqual(["甲", "乙"]);
    expect(result.error).toContain("500");
  });

  it("只返回部分结果时，剩下的接在后面（不丢候选）", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify({ results: [{ index: 1, relevance_score: 0.9 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const result = await rerankList("问题", ["甲", "乙", "丙"], (s) => s, config);
    expect(result.items[0]).toBe("乙");
    expect(result.items).toHaveLength(3);
  });
});
