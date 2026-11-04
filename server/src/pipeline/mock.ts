// 全链的离线 mock 依赖（测试与 `pipeline-test` 命令共用）
//
// 目的：不碰真实微信/外网，也能验证「消息 → 解析 → 抓取 → 图片 → 状态 → 落库」编排正确。
// 这不是生产代码路径：生产装配在 pipeline/wire.ts。
import type { Clip, NormalizedItem } from "../store/types.ts";
import type { ParsedArticle } from "../fetch/article.ts";
import type { ImageDownloadResult } from "../fetch/images.ts";
import type { PipelineDeps } from "./run.ts";

export const MOCK_ARTICLE_URL =
  "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=2247510388&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716";
export const MOCK_IMAGE_URLS = [
  "https://mmbiz.qpic.cn/mmbiz_png/mock-one/0?wx_fmt=png",
  "https://mmbiz.qpic.cn/mmbiz_png/mock-two/0?wx_fmt=png",
];

/** 模拟的公众号消息（link 形态） */
export const MOCK_MESSAGES: Array<Record<string, unknown>> = [
  {
    msgid: "mock-1",
    msgtype: "link",
    link: { url: MOCK_ARTICLE_URL, title: "Mock 文章标题", desc: "Mock 摘要", pic_url: "" },
  },
  {
    msgid: "mock-2",
    msgtype: "text",
    text: { content: "看看【咖喱的图文作品】莱昂纳少太有腔调了# 小李子 https://v.douyin.com/mock/" },
  },
  { msgid: "mock-3", msgtype: "event", event: { event_type: "enter_session" } },
];

export interface MockOptions {
  /** 正文文字；传空串模拟“空正文” */
  text?: string;
  /** 这些图片地址下载会失败 */
  failImages?: string[];
  /** 抓取正文时抛错（模拟风控/网络） */
  failFetch?: Error;
  /** B站元数据获取抛错（模拟 API 失败） */
  failBilibili?: Error;
}

/** 模拟的 B站短链消息（T-03：用于验证元数据是否真的接入流水线） */
export const MOCK_BILIBILI_MESSAGE: Record<string, unknown> = {
  msgid: "mock-bili",
  msgtype: "link",
  link: { url: "https://b23.tv/mockBv", title: "B站短链卡片" },
};

export interface MockHandle {
  deps: PipelineDeps;
  store: Map<string, Clip>;
  assets: Map<string, Buffer>;
  /** 记录每次下载的图片地址，便于断言去重 */
  downloaded: string[];
}

/** 构造一套内存版依赖：不联网、不落盘 */
export function createMockDeps(opts: MockOptions = {}): MockHandle {
  const store = new Map<string, Clip>();
  const assets = new Map<string, Buffer>();
  const downloaded: string[] = [];
  const text = opts.text ?? "这是 Mock 正文，用来验证全链编排。";

  const article: ParsedArticle = {
    meta: {
      title: "Mock 文章标题",
      account: "Mock 公众号",
      author: "Mock 作者",
      publishedAt: "2026-11-01T00:00:00.000Z",
      textLen: text.length,
      riskHits: [],
    },
    contentHtml:
      '<div id="js_content"><p>' +
      text +
      "</p>" +
      MOCK_IMAGE_URLS.map((u) => '<p><img src="' + u + '" alt="图"></p>').join("") +
      "</div>",
    imageManifest: MOCK_IMAGE_URLS.map((u) => ({ assetId: "mock" + u.length, sourceUrl: u, from: "src" as const })),
    rawHtmlBytes: 1024,
  };

  const deps: PipelineDeps = {
    async fetchArticle() {
      if (opts.failFetch) throw opts.failFetch;
      return article;
    },
    async downloadImage(url: string): Promise<ImageDownloadResult> {
      if (opts.failImages?.includes(url)) throw new Error("模拟图片下载失败：" + url);
      downloaded.push(url);
      const assetId = "img" + String(downloaded.length).padStart(9, "0");
      return {
        assetRef: { assetId, provider: "local", ext: "png" },
        bytes: 8,
        outPath: assetId + ".png",
      };
    },
    async fetchBilibili(url: string): Promise<NormalizedItem> {
      if (opts.failBilibili) throw opts.failBilibili;
      return {
        source: "bilibili",
        sourceUrl: url,
        title: "B站 Mock 标题",
        desc: "B站 Mock 简介",
        coverUrl: "https://i1.hdslb.com/bfs/archive/mock.jpg",
        author: "MockUP",
        capability: "metadata-only",
        note: "UP主 MockUP · 时长 60 秒（公开 API）",
      };
    },
    saveClip(clip: Clip) {
      store.set(clip.id, clip);
    },
    existsClip(id: string) {
      return store.has(id);
    },
    writeAssetFile(assetId: string, ext: string, body: Buffer) {
      assets.set(assetId + "." + ext, body);
      return assetId + "." + ext;
    },
    now: () => new Date("2026-11-04T00:00:00.000Z"),
  };

  return { deps, store, assets, downloaded };
}

/** 给测试用：快速造一条归一化条目 */
export function mockItem(overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    source: "wechat_mp",
    sourceUrl: MOCK_ARTICLE_URL,
    title: "Mock 文章标题",
    desc: "",
    coverUrl: "",
    capability: "full",
    ...overrides,
  };
}
