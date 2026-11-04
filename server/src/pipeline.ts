// 离线 HTML 导入（阶段一 · 本地原型）
//
// 输入：server/out/offline_*.html（由抓取流程产出，图片已内嵌 base64）
// 行为：逐个解析 → 状态判定（SNAP-02）→ 幂等落库（G1：资源只存编号）→ 结算
// 幂等：同一篇文章（按 __biz/mid/idx/sn）只入库一次
//
// 注意：本文件只负责“离线导入”这一子链路；消息 → 抓取 → 图片 → 落库的完整编排
// 在 pipeline/run.ts（runPipeline）。不要把 demo 的执行结果当成全链验证。
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, ASSETS_DIR } from "./config.ts";
import { clipIdFor } from "./store/clipId.ts";
import { saveClip, existsClip, writeAssetFile, getClip } from "./store/localStore.ts";
import type { Clip } from "./store/types.ts";
import { canonicalWechatArticleUrl } from "./fetch/article.ts";
import { extractJsContent, unescapeEntities, htmlToText, sanitizeContent } from "./fetch/htmlSanitize.ts";
import { auditSnapshotImages, hardenOfflineHtml } from "./fetch/snapshot.ts";
import { deriveStatus } from "./pipeline/status.ts";

export interface DemoStats {
  scanned: number;
  saved: number;
  skippedExisting: number;
  failed: number;
  failures: string[];
  elapsedMs: number;
}

function metaAccount(html: string): string {
  return (html.match(/<div class="meta">([^·<]+)/) ?? [])[1]?.trim() ?? "";
}
function metaAuthor(html: string): string {
  return (html.match(/作者[：\s]*([^·<]+)/) ?? [])[1]?.trim() ?? "";
}
function metaPublished(html: string): string | null {
  const m = html.match(/发布于\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! + "T00:00:00.000Z" : null;
}
function metaTitle(html: string): string {
  const raw = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? [])[1] ?? "";
  return unescapeEntities(raw.replace(/<[^>]+>/g, "")).trim() || "(无标题)";
}
function metaSourceUrl(html: string): string | null {
  const m = html.match(/原文：<a href="([^"]+)"/);
  return m ? m[1]! : null;
}

function listOfflineFiles(): string[] {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return fs
    .readdirSync(OUT_DIR)
    .filter((f) => /^offline_\d+\.html$/.test(f))
    .map((f) => path.join(OUT_DIR, f))
    .sort();
}

/** 把一个离线 HTML 变成一条剪藏记录（幂等：已存在就跳过；状态按 SNAP-02 推导） */
export function ingestOfflineHtml(offlinePath: string): { saved: boolean; clip: Clip } {
  const html = fs.readFileSync(offlinePath, "utf8");
  // 关键坑：离线 HTML 里的 URL 是 &amp; 实体形式，必须先转义还原
  const sourceUrl = unescapeEntities(metaSourceUrl(html) ?? "");
  // 源 URL 校验（origin 白名单 + 参数重建）——失败也算一条失败记录
  const canonical = canonicalWechatArticleUrl(sourceUrl);
  const id = clipIdFor(canonical.toString());

  if (existsClip(id)) {
    const existing = getClip(id);
    if (!existing) throw new Error("记录存在但读取失败：" + id);
    return { saved: false, clip: existing };
  }

  // 正文：抽出 js_content 后清洗（离线快照允许位图 data URI）
  const rawContent = extractJsContent(html) ?? "";
  const content = sanitizeContent(rawContent, { allowDataImages: true });
  const text = htmlToText(content);

  // 1) 审计原始快照：统计整页所有图片来源（img.src/srcset、source、CSS background），
  //    相对引用必须能在资源目录里找到文件（第三轮 T-01）
  const audit = auditSnapshotImages(html, ASSETS_DIR);
  // 2) 生成落盘快照：清掉外链/脚本型资源引用，并注入项目自己的 CSP（T-02/T-05）
  const snapshotHtml = hardenOfflineHtml(html);

  // 离线 HTML 作为“完整快照”资源落盘（G1：AssetRef 只存编号）
  const assetId = id.replace(/^wx_/, "");
  writeAssetFile(assetId, "html", Buffer.from(snapshotHtml, "utf8"));

  const { status, failReason } = deriveStatus({
    textLength: text.length,
    imagesTotal: audit.total,
    imagesFailed: audit.failed,
  });

  const imageNotes: string[] = [];
  if (audit.external > 0) imageNotes.push("外链图 " + audit.external + " 张未本地化（已从快照移除）");
  if (audit.missing > 0) imageNotes.push("本地图片缺失 " + audit.missing + " 张");
  if (audit.invalid > 0) imageNotes.push("无效图片引用 " + audit.invalid + " 处");

  const clip: Clip = {
    id,
    source: "wechat_mp",
    // N-11：sourceUrl 保留快照里的原始分享链接（一字不删），canonicalUrl 单独存抓取用地址
    sourceUrl,
    canonicalUrl: canonical.toString(),
    title: metaTitle(html),
    author: metaAuthor(html),
    account: metaAccount(html),
    publishedAt: metaPublished(html),
    savedAt: new Date().toISOString(),
    text,
    assets: [{ assetId, provider: "local", ext: "html" }],
    status,
    failReason,
    note:
      status === "failed"
        ? "正文为空，未生成完整快照"
        : imageNotes.length > 0
          ? imageNotes.join("；")
          : undefined,
  };
  saveClip(clip);
  return { saved: true, clip };
}

export function runDemo(): DemoStats {
  const started = Date.now();
  const stats: DemoStats = { scanned: 0, saved: 0, skippedExisting: 0, failed: 0, failures: [], elapsedMs: 0 };

  const files = listOfflineFiles();
  stats.scanned = files.length;

  for (const file of files) {
    try {
      const r = ingestOfflineHtml(file);
      if (r.saved) stats.saved += 1;
      else stats.skippedExisting += 1;
    } catch (e) {
      stats.failed += 1;
      stats.failures.push(path.basename(file) + " → " + String((e as Error).message).slice(0, 120));
    }
  }

  stats.elapsedMs = Date.now() - started;
  return stats;
}
