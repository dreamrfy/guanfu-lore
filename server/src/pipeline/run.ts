// 全链编排（P1-01）：消息 → 解析 → 抓正文 → 下载图片 → 状态判定 → 幂等落库
//
// 设计：所有外部能力都通过 deps 注入——测试可以完全离线跑（mock 抓取/图片/存储），
// 生产由 pipeline/wire.ts 接到真实实现。这样“全链跑通”是可复现的，不依赖线上数据。
import type { Clip, FailReason, NormalizedItem } from "../store/types.ts";
import type { ParsedArticle } from "../fetch/article.ts";
import type { ImageDownloadResult } from "../fetch/images.ts";
import { buildOfflineHtml, canonicalWechatArticleUrl } from "../fetch/article.ts";
import { clipIdFor } from "../store/clipId.ts";
import { rewriteImageSources } from "../fetch/htmlSanitize.ts";
import { classifyFailure, withRetry } from "./failure.ts";
import { deriveStatus } from "./status.ts";
import { parseKfMessage } from "../sources/wecomMessage.ts";

export interface PipelineDeps {
  /** 抓取并解析公众号正文（生产实现走安全 HTTP 层） */
  fetchArticle: (url: string) => Promise<ParsedArticle>;
  /** 下载一张图片并落盘（生产实现走 images.downloadImage） */
  downloadImage: (url: string) => Promise<ImageDownloadResult>;
  /** 落库（幂等：同 id 覆盖） */
  saveClip: (clip: Clip) => void;
  /** 是否已存在（重复转发跳过） */
  existsClip: (id: string) => boolean;
  /** 资源落盘（快照 HTML / 图片统一走存储层） */
  writeAssetFile: (assetId: string, ext: string, body: Buffer) => string;
  /**
   * B站元数据（公开 API，T-03）：把 b23.tv 短链解析成标题/简介/UP主/封面。
   * 不注入时，bilibili 条目只保留转发文案，并在 note 里标明“未接入”。
   */
  fetchBilibili?: (url: string) => Promise<NormalizedItem>;
  /** 时钟（测试注入固定时间） */
  now?: () => Date;
  /** 重试策略（默认只重试网络类错误） */
  retry?: <T>(fn: () => Promise<T>) => Promise<T>;
}

export interface PipelineFailure {
  sourceUrl: string;
  reason: FailReason;
  message: string;
}

export interface PipelineStats {
  /** 输入消息条数 */
  messages: number;
  /** 成功解析为条目的消息数 */
  parsed: number;
  /** 无法识别而跳过的消息数 */
  skippedUnrecognized: number;
  /** 已入库而跳过的条目数（幂等） */
  skippedExisting: number;
  /** 本轮新入库条数 */
  saved: number;
  complete: number;
  partial: number;
  failed: number;
  /** 正文中发现的图片数 */
  imagesTotal: number;
  imagesDownloaded: number;
  imagesFailed: number;
  failures: PipelineFailure[];
  elapsedMs: number;
}

function defaultRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, { tries: 2 });
}

/** 快照资源编号：从剪藏 id 去掉前缀（wx_/url_/invalid_），保持 16 位十六进制 */
function snapshotAssetId(id: string): string {
  return id.replace(/^[a-z]+_/, "");
}

function errorMessage(e: unknown): string {
  return String((e as Error)?.message ?? e).slice(0, 200);
}

export async function runPipeline(
  messages: Array<Record<string, unknown>>,
  deps: PipelineDeps
): Promise<PipelineStats> {
  const started = Date.now();
  const retry = deps.retry ?? defaultRetry;
  const nowIso = () => (deps.now ? deps.now() : new Date()).toISOString();

  const stats: PipelineStats = {
    messages: messages.length,
    parsed: 0,
    skippedUnrecognized: 0,
    skippedExisting: 0,
    saved: 0,
    complete: 0,
    partial: 0,
    failed: 0,
    imagesTotal: 0,
    imagesDownloaded: 0,
    imagesFailed: 0,
    failures: [],
    elapsedMs: 0,
  };

  for (const msg of messages) {
    let item: NormalizedItem | null = null;
    try {
      item = parseKfMessage(msg);
    } catch {
      // 解析器承诺不抛异常；这里再兜一层，保证单条坏消息不中断整轮
      item = null;
    }
    if (!item) {
      stats.skippedUnrecognized += 1;
      continue;
    }
    stats.parsed += 1;

    // ---- 元数据型来源（B站/小红书/抖音阶段一）：只存标题/描述/封面 ----
    if (item.capability === "metadata-only" || item.source !== "wechat_mp") {
      // B站：接入公开 API 元数据（T-03）。失败只降级 note，不影响记录落库。
      if (item.source === "bilibili") {
        if (!deps.fetchBilibili) {
          item.note = "B站元数据模块未接入（当前只保存转发文案）" + (item.note ? "；" + item.note : "");
        } else {
          try {
            const meta = await deps.fetchBilibili(item.sourceUrl);
            item.title = meta.title || item.title;
            item.desc = meta.desc || item.desc;
            item.author = meta.author || item.author;
            item.coverUrl = meta.coverUrl || item.coverUrl;
            item.note = meta.note ?? item.note;
          } catch (e) {
            const reason = classifyFailure(e);
            stats.failures.push({ sourceUrl: item.sourceUrl, reason, message: errorMessage(e) });
            item.note = "B站元数据获取失败：" + errorMessage(e);
          }
        }
      }

      const id = clipIdFor(item.sourceUrl);
      if (deps.existsClip(id)) {
        stats.skippedExisting += 1;
        continue;
      }
      const { status, failReason } = deriveStatus({
        textLength: (item.title + item.desc).trim().length,
        imagesTotal: 0,
        imagesFailed: 0,
        metadataOnly: true,
      });
      const clip: Clip = {
        id,
        source: item.source,
        sourceUrl: item.sourceUrl,
        title: item.title || "(无标题)",
        author: item.author ?? "",
        account: "",
        publishedAt: null,
        savedAt: nowIso(),
        text: item.desc,
        assets: [],
        status,
        failReason,
        note: item.note,
      };
      persist(stats, deps, clip);
      continue;
    }

    // ---- 公众号：完整抓取 ----
    let canonical: string;
    try {
      canonical = canonicalWechatArticleUrl(item.sourceUrl).toString();
    } catch (e) {
      const id = clipIdFor(item.sourceUrl);
      if (deps.existsClip(id)) {
        stats.skippedExisting += 1;
        continue;
      }
      const reason: FailReason = "unsupported_type";
      const clip = failedClip(id, item, nowIso(), reason, "");
      stats.failures.push({ sourceUrl: item.sourceUrl, reason, message: errorMessage(e) });
      persist(stats, deps, clip);
      continue;
    }

    const id = clipIdFor(canonical);
    if (deps.existsClip(id)) {
      stats.skippedExisting += 1;
      continue;
    }

    let parsed: ParsedArticle;
    try {
      parsed = await retry(() => deps.fetchArticle(canonical));
    } catch (e) {
      const reason = classifyFailure(e);
      const clip = failedClip(id, item, nowIso(), reason, "");
      clip.canonicalUrl = canonical;
      stats.failures.push({ sourceUrl: canonical, reason, message: errorMessage(e) });
      persist(stats, deps, clip);
      continue;
    }

    // ---- 图片：先按 URL 去重再逐张下载；失败只降级为 partial，不丢正文 ----
    const mapping = new Map<string, string>();
    const assets: Clip["assets"] = [];
    let imageFailed = 0;
    const seenImageUrls = new Set<string>();
    const uniqueManifest = parsed.imageManifest.filter((entry) => {
      if (seenImageUrls.has(entry.sourceUrl)) return false;
      seenImageUrls.add(entry.sourceUrl);
      return true;
    });
    stats.imagesTotal += uniqueManifest.length;
    for (const entry of uniqueManifest) {
      try {
        const downloaded = await retry(() => deps.downloadImage(entry.sourceUrl));
        mapping.set(entry.sourceUrl, downloaded.assetRef.assetId + "." + downloaded.assetRef.ext);
        assets.push(downloaded.assetRef);
        stats.imagesDownloaded += 1;
      } catch (e) {
        imageFailed += 1;
        stats.imagesFailed += 1;
        const reason = classifyFailure(e);
        stats.failures.push({
          sourceUrl: entry.sourceUrl,
          // 图片下载的网络失败也归到 images_failed，便于按“缺图”统计
          reason: reason === "network_timeout" ? "images_failed" : reason,
          message: errorMessage(e),
        });
      }
    }

    const contentHtml = rewriteImageSources(parsed.contentHtml, mapping);

    // ---- 快照 HTML 落盘（图片已替换为同目录相对引用） ----
    let assetWriteFailures = 0;
    const htmlAssetId = snapshotAssetId(id);
    try {
      const offline = buildOfflineHtml(parsed.meta, contentHtml, canonical);
      deps.writeAssetFile(htmlAssetId, "html", Buffer.from(offline, "utf8"));
      assets.unshift({ assetId: htmlAssetId, provider: "local", ext: "html" });
    } catch (e) {
      assetWriteFailures += 1;
      stats.failures.push({ sourceUrl: canonical, reason: "internal_error", message: errorMessage(e) });
    }

    const { status, failReason } = deriveStatus({
      textLength: parsed.meta.textLen,
      imagesTotal: uniqueManifest.length,
      imagesFailed: imageFailed,
      assetWriteFailures,
    });

    const note =
      imageFailed > 0
        ? "缺图 " + imageFailed + " 张（其余内容已保存）"
        : status === "failed"
          ? "正文为空，未生成完整快照"
          : undefined;

    const clip: Clip = {
      id,
      source: "wechat_mp",
      // N-11：原始分享链接一字不删；抓取用的规范化地址单独存
      sourceUrl: item.sourceUrl,
      canonicalUrl: canonical,
      title: parsed.meta.title,
      author: parsed.meta.author,
      account: parsed.meta.account,
      publishedAt: parsed.meta.publishedAt,
      savedAt: nowIso(),
      text: parsed.contentHtml ? stripTagsToText(parsed.contentHtml) : "",
      assets,
      status,
      failReason,
      note,
    };
    persist(stats, deps, clip);
  }

  stats.elapsedMs = Date.now() - started;
  return stats;
}

function stripTagsToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function failedClip(
  id: string,
  item: NormalizedItem,
  savedAt: string,
  reason: FailReason,
  note: string
): Clip {
  return {
    id,
    source: item.source,
    sourceUrl: item.sourceUrl,
    title: item.title || "(无标题)",
    author: item.author ?? "",
    account: "",
    publishedAt: null,
    savedAt,
    text: "",
    assets: [],
    status: "failed",
    failReason: reason,
    note: note || item.note,
  };
}

function persist(stats: PipelineStats, deps: PipelineDeps, clip: Clip): void {
  try {
    deps.saveClip(clip);
  } catch (e) {
    stats.failed += 1;
    stats.failures.push({ sourceUrl: clip.sourceUrl, reason: "internal_error", message: errorMessage(e) });
    return;
  }
  stats.saved += 1;
  if (clip.status === "complete") stats.complete += 1;
  else if (clip.status === "partial") stats.partial += 1;
  else stats.failed += 1;
}
