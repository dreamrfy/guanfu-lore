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
import { OUT_DIR } from "./config.ts";
import { clipIdFor } from "./store/clipId.ts";
import { saveClip, existsClip, writeAssetFile, getClip } from "./store/localStore.ts";
import type { Clip } from "./store/types.ts";
import { canonicalWechatArticleUrl } from "./fetch/article.ts";
import { extractJsContent, unescapeEntities, htmlToText, sanitizeContent, hardenOfflineHtml } from "./fetch/htmlSanitize.ts";
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

/** 统计正文里的图片：总数，以及“没有可用地址”的失败数 */
function imageStats(contentHtml: string): { total: number; failed: number } {
  const tags = contentHtml.match(/<img\b[^>]*>/gi) ?? [];
  let failed = 0;
  for (const tag of tags) {
    const m = tag.match(/\ssrc\s*=\s*"([^"]*)"/i);
    const src = m ? unescapeEntities(m[1]!) : "";
    // 离线快照里的图片有两种合法形态：http(s) 外链（未内嵌）或 data: 内嵌
    if (!/^(https?:|data:image\/)/i.test(src)) failed += 1;
  }
  return { total: tags.length, failed };
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

  // 正文：抽出 js_content 后清洗（离线快照允许 data: 内嵌图）
  const rawContent = extractJsContent(html) ?? "";
  const content = sanitizeContent(rawContent, { allowDataImages: true });
  const text = htmlToText(content);
  const { total: imagesTotal, failed: imagesFailed } = imageStats(content);

  // 离线 HTML 作为“完整快照”资源落盘（G1：AssetRef 只存编号）
  // 落盘前整页加固：去可执行内容 + 注入 CSP（保留原有样式与内嵌图片）
  const assetId = id.replace(/^wx_/, "");
  writeAssetFile(assetId, "html", Buffer.from(hardenOfflineHtml(html), "utf8"));

  const { status, failReason } = deriveStatus({
    textLength: text.length,
    imagesTotal,
    imagesFailed,
  });

  const clip: Clip = {
    id,
    source: "wechat_mp",
    sourceUrl: canonical.toString(),
    title: metaTitle(html),
    author: metaAuthor(html),
    account: metaAccount(html),
    publishedAt: metaPublished(html),
    savedAt: new Date().toISOString(),
    text,
    assets: [{ assetId, provider: "local", ext: "html" }],
    status,
    failReason,
    note: status === "failed" ? "正文为空，未生成完整快照" : imagesFailed > 0 ? "缺图 " + imagesFailed + " 张（其余内容已保存）" : undefined,
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
