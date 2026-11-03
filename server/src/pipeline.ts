// 全链串联（阶段一 · 本地原型）
//
// 输入：server/out/offline_*.html（由仓库外抓取工具产出，图片已内嵌 base64）
// 行为：逐个解析 → 幂等落库（G1：资源只存编号）→ 结算
// 幂等：同一篇文章（按 __biz/mid/idx/sn）只入库一次
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR } from "./config.ts";
import { clipIdFor } from "./store/clipId.ts";
import { saveClip, existsClip, writeAssetFile } from "./store/localStore.ts";
import type { Clip } from "./store/types.ts";
import { canonicalWechatArticleUrl } from "./fetch/article.ts";
import { extractJsContent, unescapeEntities } from "./fetch/htmlSanitize.ts";

export interface DemoStats {
  scanned: number;
  saved: number;
  skippedExisting: number;
  failed: number;
  failures: string[];
  elapsedMs: number;
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
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
  return (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? [])[1]?.replace(/<[^>]+>/g, "").trim() ?? "(无标题)";
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

/** 把一个离线 HTML 变成一条剪藏记录（幂等：已存在就跳过） */
export function ingestOfflineHtml(offlinePath: string): { saved: boolean; clip: Clip } {
  const html = fs.readFileSync(offlinePath, "utf8");
  // 关键坑：离线 HTML 里的 URL 是 &amp; 实体形式，必须先转义还原
  const sourceUrl = unescapeEntities(metaSourceUrl(html) ?? "");
  // 源 URL 校验（origin 白名单 + 参数重建）——失败也算一条失败记录
  const canonical = canonicalWechatArticleUrl(sourceUrl);
  const id = clipIdFor(canonical.toString());

  if (existsClip(id)) return { saved: false, clip: { ...emptyClip(id), sourceUrl } };

  // 离线 HTML 作为“完整快照”资源落盘（G1：AssetRef 只存编号）
  const assetId = id.replace(/^wx_/, "");
  writeAssetFile(assetId, "html", Buffer.from(html));
  const assets = [{ assetId, provider: "local" as const, ext: "html" }];

  const clip: Clip = {
    id,
    source: "wechat_mp",
    sourceUrl: canonical.toString(),
    title: metaTitle(html),
    author: metaAuthor(html),
    account: metaAccount(html),
    publishedAt: metaPublished(html),
    savedAt: new Date().toISOString(),
    text: textOf(extractJsContent(html) ?? ""),
    assets,
    status: "complete",
    failReason: null,
  };
  saveClip(clip);
  return { saved: true, clip };
}

function emptyClip(id: string): Clip {
  return {
    id,
    source: "wechat_mp",
    sourceUrl: "",
    title: "",
    author: "",
    account: "",
    publishedAt: null,
    savedAt: new Date().toISOString(),
    text: "",
    assets: [],
    status: "pending",
    failReason: null,
  };
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
