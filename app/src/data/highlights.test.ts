/**
 * 网页划线客户端渲染（H03）回归测试。
 *
 * 走真实 locator.js（extension/ 目录的 UMD，借 ESM 副作用导入挂到全局），
 * 只把网络层 fetch 打桩，验证：按 URL 取回划线、多条共存定位、空白折叠命中、
 * 服务器不可达静默降级、重叠与摘录形状。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHighlights, highlightExcerpts, type HighlightItem } from "./highlights";

type ItemInput = Partial<Omit<HighlightItem, "quote">> & {
  quote: { exact: string; prefix?: string; suffix?: string };
};

function item(partial: ItemInput): HighlightItem {
  return {
    id: partial.id ?? "h-" + Math.random().toString(16).slice(2, 10),
    pageUrl: partial.pageUrl ?? "https://mp.weixin.qq.com/s/demo",
    title: partial.title ?? "演示文章",
    createdAt: partial.createdAt ?? Date.now(),
    quote: {
      exact: partial.quote.exact,
      prefix: partial.quote.prefix ?? "",
      suffix: partial.quote.suffix ?? "",
    },
  };
}

const ARTICLE = [
  "观复是一个本地优先的个人知识库。",
  "它把网页剪藏、随手记的想法和表格数据放在同一个库里。",
  "划线的意义在于：读到哪一段被打动，就留在哪一段。",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("highlightExcerpts（定位与摘录）", () => {
  it("多条共存：两条划线都定位到，按出现顺序返回，mark 正好包住引文", () => {
    const items = [
      item({ id: "b", quote: { exact: "划线的意义在于", prefix: "就留在哪一段。", suffix: "" } }),
      item({ id: "a", quote: { exact: "本地优先的个人知识库", prefix: "观复是一个", suffix: "。它把网页" } }),
    ];
    const excerpts = highlightExcerpts(ARTICLE, items);
    expect(excerpts).toHaveLength(2);
    expect(excerpts[0].id).toBe("a"); // 第一条在前
    expect(excerpts[0].mark).toBe("本地优先的个人知识库");
    expect(excerpts[1].mark).toBe("划线的意义在于");
    expect(excerpts[0].before.startsWith("观复是一个")).toBe(true);
    expect(excerpts[1].after.startsWith("：读到哪一段")).toBe(true);
  });

  it("空白折叠：快照里的换行/缩进不影响命中（活页↔快照闭环）", () => {
    const snapshotText = "观复是一个\n  本地优先的个人知识库 。它把网页……"; // 多了换行和空格
    const items = [item({ quote: { exact: "本地优先的个人知识库", prefix: "观复是一个", suffix: "" } })];
    const excerpts = highlightExcerpts(snapshotText, items);
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].mark).toBe("本地优先的个人知识库");
  });

  it("定位不到的划线跳过不报错（正文可能被编辑过）", () => {
    const items = [
      item({ id: "gone", quote: { exact: "正文里根本没有这句话" } }),
      item({ id: "kept", quote: { exact: "划线的意义在于" } }),
    ];
    const excerpts = highlightExcerpts(ARTICLE, items);
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].id).toBe("kept");
  });

  it("重叠划线只留先出现的那条，绝不叠 mark", () => {
    const items = [
      item({ id: "first", quote: { exact: "本地优先的个人知识库" } }),
      item({ id: "overlap", quote: { exact: "知识库。它把网页" } }),
    ];
    const excerpts = highlightExcerpts(ARTICLE, items);
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].id).toBe("first");
  });

  it("空文本或无划线返回空数组", () => {
    expect(highlightExcerpts("", [item({ quote: { exact: "x" } })])).toEqual([]);
    expect(highlightExcerpts(ARTICLE, [])).toEqual([]);
    expect(highlightExcerpts(ARTICLE, [item({ quote: { exact: "" } })])).toEqual([]);
  });
});

describe("fetchHighlights（服务器取回）", () => {
  it("带 Token 取回划线清单；服务器应答形状不对时返回空数组", async () => {
    const items = [item({ quote: { exact: "本地优先" } })];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/highlights?pageUrl=");
      expect(url).toContain(encodeURIComponent("https://mp.weixin.qq.com/s/demo"));
      return new Response(JSON.stringify({ ok: true, items }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchHighlights("https://mp.weixin.qq.com/s/demo")).toHaveLength(1);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 200 }))
    );
    expect(await fetchHighlights("https://mp.weixin.qq.com/s/demo")).toEqual([]);
  });

  it("服务器 404（H05 未部署）/网络异常 → 空数组不抛错", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    expect(await fetchHighlights("https://mp.weixin.qq.com/s/demo")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    expect(await fetchHighlights("https://mp.weixin.qq.com/s/demo")).toEqual([]);
    expect(await fetchHighlights("")).toEqual([]); // 空地址直接空数组
  });
});
