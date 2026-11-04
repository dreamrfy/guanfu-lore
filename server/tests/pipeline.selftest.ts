// 全链编排自测（P1-01 / P1-05 / P0-02）：完全离线，用 mock 依赖跑通整条链
// 覆盖：完整成功、幂等重跑、空正文、缺图、抓取失败、未知消息、资源只存编号。
// 用法: node tests/pipeline.selftest.ts
import { runPipeline } from "../src/pipeline/run.ts";
import { createMockDeps, MOCK_MESSAGES, MOCK_IMAGE_URLS, MOCK_ARTICLE_URL, MOCK_BILIBILI_MESSAGE } from "../src/pipeline/mock.ts";
import { FetchError } from "../src/fetch/http.ts";
import { clipIdFor } from "../src/store/clipId.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

// ---- 1. 完整成功 + 元数据型降级 ----
{
  const mock = createMockDeps();
  const stats = await runPipeline(MOCK_MESSAGES, mock.deps);
  check("输入 3 条消息", stats.messages === 3, String(stats.messages));
  check("识别 2 条（事件消息跳过）", stats.parsed === 2 && stats.skippedUnrecognized === 1, JSON.stringify(stats));
  check("新入库 2 条", stats.saved === 2, String(stats.saved));
  check("公众号 → complete", stats.complete === 1, String(stats.complete));
  check("抖音 → partial（阶段一只有元数据）", stats.partial === 1, String(stats.partial));
  check("图片 2 张全部下载", stats.imagesTotal === 2 && stats.imagesDownloaded === 2, JSON.stringify(stats));
  check("无失败", stats.failed === 0 && stats.failures.length === 0, JSON.stringify(stats.failures));

  const clips = [...mock.store.values()];
  const wechat = clips.find((c) => c.source === "wechat_mp")!;
  const douyin = clips.find((c) => c.source === "douyin")!;
  check("公众号正文非空", wechat.text.length > 0, String(wechat.text.length));
  check("公众号状态 complete 且无失败原因", wechat.status === "complete" && wechat.failReason === null);
  check("抖音状态 partial + content_missing", douyin.status === "partial" && douyin.failReason === "content_missing");
  check("抖音 note 写明阶段二", (douyin.note ?? "").includes("阶段二"), String(douyin.note));

  // G1：资源只存编号，不存 URL
  const serialized = JSON.stringify(clips);
  check("记录里没有完整图片 URL", !serialized.includes("mmbiz.qpic.cn"), serialized.slice(0, 200));
  check("assets 是 assetId/provider/ext 结构", wechat.assets.every((a) => /^[0-9a-z]+$/.test(a.assetId) && a.provider === "local"));
  check("快照 HTML 已落盘", [...mock.assets.keys()].some((k) => k.endsWith(".html")), [...mock.assets.keys()].join(","));

  // 快照里的图片已替换为本地相对引用
  const htmlEntry = [...mock.assets.entries()].find(([k]) => k.endsWith(".html"))!;
  const html = htmlEntry[1].toString("utf8");
  check("快照不含外链图片", !/src="https?:\/\//.test(html), html.slice(0, 300));
  check("快照图片是本地引用", /src="img\d{9}\.png"/.test(html), html.slice(0, 300));
  check("快照带 CSP", /Content-Security-Policy/.test(html), "缺少 CSP meta");
  // 只允许「本地图片编号 + html 快照编号」这类引用；出现 URL 一律算失败
  const assetJson = JSON.stringify(wechat.assets);
  check(
    "assets 全是编号引用（不含 URL）",
    !/https?:/.test(assetJson) && wechat.assets.some((a) => a.ext === "html") && wechat.assets.length >= 2,
    assetJson
  );
  check(
    "快照正文里图片是本地文件名引用",
    /src="img\d{9}\.png"/.test(mock.assets.get(wechat.assets[0]!.assetId + ".html")?.toString("utf8") ?? ""),
    "快照未使用本地图片引用"
  );
}

// ---- 2. 幂等：同一批消息重跑不新增 ----
{
  const mock = createMockDeps();
  await runPipeline(MOCK_MESSAGES, mock.deps);
  const before = mock.store.size;
  const second = await runPipeline(MOCK_MESSAGES, mock.deps);
  check("重跑不新增记录", mock.store.size === before, before + " → " + mock.store.size);
  check("重跑全部跳过", second.saved === 0 && second.skippedExisting === 2, JSON.stringify(second));
}

// ---- 3. 跟踪参数不同 → 同一条记录 ----
{
  const mock = createMockDeps();
  const base = MOCK_MESSAGES[0]!;
  const withTracking = {
    msgid: "mock-tracking",
    msgtype: "link",
    link: { url: MOCK_ARTICLE_URL + "&mpshare=1&scene=1&srcid=abc", title: "同一篇" },
  };
  await runPipeline([base], mock.deps);
  const stats = await runPipeline([withTracking], mock.deps);
  check("跟踪参数不产生新记录", mock.store.size === 1 && stats.skippedExisting === 1, JSON.stringify(stats));
}

// ---- 4. 空正文：绝不 complete ----
{
  const mock = createMockDeps({ text: "" });
  const stats = await runPipeline([MOCK_MESSAGES[0]!], mock.deps);
  const clip = [...mock.store.values()][0]!;
  check("空正文 → failed", clip.status === "failed", clip.status);
  check("空正文 failReason=content_missing", clip.failReason === "content_missing", String(clip.failReason));
  check("空正文不得计入 complete", stats.complete === 0, String(stats.complete));
}

// ---- 5. 缺图：只能 partial ----
{
  const mock = createMockDeps({ failImages: [MOCK_IMAGE_URLS[0]!] });
  const stats = await runPipeline([MOCK_MESSAGES[0]!], mock.deps);
  const clip = [...mock.store.values()][0]!;
  check("缺 1 张图 → partial", clip.status === "partial", clip.status);
  check("缺图 failReason=images_failed", clip.failReason === "images_failed", String(clip.failReason));
  check("缺图 note 写明张数", (clip.note ?? "").includes("1"), String(clip.note));
  check("缺图仍保存正文", clip.text.length > 0, String(clip.text.length));
  check("统计缺图数", stats.imagesFailed === 1 && stats.imagesDownloaded === 1, JSON.stringify(stats));
}

// ---- 6. 抓取失败：按分类落 failed 记录，且不重试 ----
{
  const mock = createMockDeps();
  let calls = 0;
  const deps = {
    ...mock.deps,
    async fetchArticle() {
      calls += 1;
      throw new FetchError("EBLOCKED", "拒绝环回/私有/保留地址", false);
    },
  };
  const stats = await runPipeline([MOCK_MESSAGES[0]!], deps);
  const clip = [...mock.store.values()][0]!;
  check("SSRF 拒绝 → failed", clip.status === "failed", clip.status);
  check("SSRF 拒绝 → blocked_address", clip.failReason === "blocked_address", String(clip.failReason));
  check("SSRF 拒绝只尝试 1 次（calls=" + calls + "）", calls === 1, String(calls));
  check("失败也保留记录", stats.saved === 1 && stats.failed === 1, JSON.stringify(stats));
}

// ---- 7. 网络失败：可重试（calls > 1） ----
{
  const mock = createMockDeps();
  let calls = 0;
  const deps = {
    ...mock.deps,
    async fetchArticle() {
      calls += 1;
      throw new FetchError("ETIMEOUT", "请求超时", true);
    },
    retry: async <T,>(fn: () => Promise<T>): Promise<T> => fn(),
  };
  // 这里用默认 retry 会 sleep，改用自定义无退避 retry 只验证调用次数语义
  const noDelayDeps = {
    ...deps,
    retry: async <T,>(fn: () => Promise<T>): Promise<T> => {
      let last: unknown;
      for (let i = 0; i < 2; i++) {
        try {
          return await fn();
        } catch (e) {
          last = e;
        }
      }
      throw last;
    },
  };
  await runPipeline([MOCK_MESSAGES[0]!], noDelayDeps);
  check("网络超时会重试（calls=" + calls + "）", calls === 2, String(calls));
}

// ---- 8. 未知平台消息不进入抓取 ----
{
  const mock = createMockDeps();
  let called = 0;
  const deps = {
    ...mock.deps,
    async fetchArticle(url: string) {
      called += 1;
      return mock.deps.fetchArticle(url);
    },
  };
  const stats = await runPipeline(
    [{ msgid: "x", msgtype: "link", link: { url: "https://example.com/unknown", title: "未知" } }],
    deps
  );
  check("未知平台 → 跳过且不抓取", stats.skippedUnrecognized === 1 && called === 0, JSON.stringify(stats));
}

// ---- 9. 图片去重：manifest 里重复 URL 只下载一次（N-07） ----
{
  const mock = createMockDeps();
  const deps = {
    ...mock.deps,
    async fetchArticle() {
      const parsed = await mock.deps.fetchArticle(MOCK_ARTICLE_URL);
      return {
        ...parsed,
        imageManifest: [
          { assetId: "a", sourceUrl: MOCK_IMAGE_URLS[0]!, from: "src" as const },
          { assetId: "a", sourceUrl: MOCK_IMAGE_URLS[0]!, from: "src" as const },
        ],
      };
    },
  };
  const stats = await runPipeline([MOCK_MESSAGES[0]!], deps);
  check("重复 manifest 只下载一次（downloaded=" + mock.downloaded.length + "）", mock.downloaded.length === 1);
  check("imagesTotal 按去重后计数", stats.imagesTotal === 1, String(stats.imagesTotal));
  check("imagesDownloaded === 1", stats.imagesDownloaded === 1, String(stats.imagesDownloaded));
  const clip = [...mock.store.values()][0]!;
  check("去重后仍是 complete", clip.status === "complete", `${clip.status}/${clip.failReason}`);
}

// ---- 11. sourceUrl 契约（N-11）：原始 URL 逐字保留，canonicalUrl 单独存 ----
{
  const mock = createMockDeps();
  const trackedUrl = MOCK_ARTICLE_URL + "&mpshare=1&scene=1&srcid=abc123&sharer_shareinfo=zzz";
  const msg = { msgid: "mock-tracked", msgtype: "link", link: { url: trackedUrl, title: "带跟踪参数" } };
  await runPipeline([msg], mock.deps);
  const clip = [...mock.store.values()][0]!;
  check("sourceUrl 与消息原始 URL 逐字一致", clip.sourceUrl === trackedUrl, clip.sourceUrl);
  check("canonicalUrl 已去掉跟踪参数", !!clip.canonicalUrl && !clip.canonicalUrl.includes("mpshare"), String(clip.canonicalUrl));
  check("幂等 id 仍按 canonical 计算", clip.id === clipIdFor(clip.canonicalUrl!), clip.id);
}

// ---- 10. data-src only 的懒加载图：清洗后补 src，流水线能识别并本地化 ----
{
  const mock = createMockDeps();
  const { sanitizeContent } = await import("../src/fetch/htmlSanitize.ts");
  const raw = '<div id="js_content"><p>懒加载图片正文</p><img data-src="' + MOCK_IMAGE_URLS[0] + '" alt="懒加载"></div>';
  const deps = {
    ...mock.deps,
    async fetchArticle() {
      const base = await mock.deps.fetchArticle(MOCK_ARTICLE_URL);
      return {
        ...base,
        meta: { ...base.meta, textLen: "懒加载图片正文".length },
        contentHtml: sanitizeContent(raw),
        imageManifest: [{ assetId: "a", sourceUrl: MOCK_IMAGE_URLS[0]!, from: "data-src" as const }],
      };
    },
  };
  const stats = await runPipeline([MOCK_MESSAGES[0]!], deps);
  const clip = [...mock.store.values()][0]!;
  const html = [...mock.assets.entries()].find(([k]) => k.endsWith(".html"))![1].toString("utf8");
  check("data-src only 图片被下载", stats.imagesDownloaded === 1, JSON.stringify(stats));
  check("data-src only 快照里是本地引用", !/src="https?:\/\/mmbiz/.test(html) && /src="img\d{9}\.png"/.test(html), html.slice(0, 300));
  check("data-src only 记录为 complete", clip.status === "complete", `${clip.status}/${clip.failReason}`);
}

// ---- 12. B站元数据接入（T-03） ----
{
  const mock = createMockDeps();
  const stats = await runPipeline([MOCK_BILIBILI_MESSAGE], mock.deps);
  const clip = [...mock.store.values()][0]!;
  check("B站条目落库", clip.source === "bilibili" && stats.saved === 1, JSON.stringify(stats));
  check("B站标题来自 API", clip.title === "B站 Mock 标题", clip.title);
  check("B站作者来自 API", clip.author === "MockUP", clip.author);
  check("B站正文（简介）来自 API", clip.text === "B站 Mock 简介", clip.text.slice(0, 40));
  check("B站 note 写明公开 API", (clip.note ?? "").includes("公开 API"), String(clip.note));
  check("B站仍是 partial（阶段一不抓正文）", clip.status === "partial", clip.status);
}

{
  // 未注入 fetchBilibili：不得假装已接入
  const mock = createMockDeps();
  const { fetchBilibili: _omit, ...depsWithoutBili } = mock.deps;
  await runPipeline([MOCK_BILIBILI_MESSAGE], depsWithoutBili);
  const clip = [...mock.store.values()][0]!;
  check("未注入时 note 标明未接入", (clip.note ?? "").includes("未接入"), String(clip.note));
}

{
  // API 失败：保留文案并记录失败原因，不中断整轮
  const mock = createMockDeps({ failBilibili: new Error("B站 API 返回 code=-404") });
  const stats = await runPipeline([MOCK_BILIBILI_MESSAGE], mock.deps);
  const clip = [...mock.store.values()][0]!;
  check("B站 API 失败仍落库", !!clip && clip.source === "bilibili");
  check("B站 API 失败写入 note", (clip.note ?? "").includes("获取失败"), String(clip.note));
  check("B站 API 失败记录到 failures", stats.failures.some((f) => f.sourceUrl.includes("b23.tv")), JSON.stringify(stats.failures));
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
