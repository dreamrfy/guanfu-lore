// 剪藏 HTTP 接口的纯逻辑层（可离线自测）
//
// 职责：把"一个网址"变成网页端能直接用的结果：
//   - 复用 runPipeline（消息 → 解析 → 抓取 → 图片 → 落库），不另写一套抓取
//   - 通过 runPipeline 的可选回调拿到正文 HTML（编排器本身不关心接口）
//   - 资源以 base64 返回；快照 HTML 里把图片内联成 data URL，网页端存一份就是完整备份
import type { AssetRef, Clip } from "./store/types.ts";
import type { PipelineDeps } from "./pipeline/run.ts";
import { runPipeline } from "./pipeline/run.ts";
import { clipIdFor } from "./store/clipId.ts";
import { canonicalWechatArticleUrl } from "./fetch/article.ts";
import { deleteClip, getClip, listClips, readAssetFile } from "./store/localStore.ts";
import { htmlTitle, htmlToText, sanitizeContent } from "./fetch/htmlSanitize.ts";

export interface ClipAssetPayload {
  assetId: string;
  ext: string;
  mime: string;
  /** base64（不带 data: 前缀） */
  base64: string;
}

export interface ClipPayload {
  id: string;
  source: Clip["source"];
  sourceUrl: string;
  canonicalUrl: string | null;
  title: string;
  author: string;
  account: string;
  publishedAt: string | null;
  savedAt: string;
  text: string;
  status: Clip["status"];
  note?: string;
}

export type ClipApiResult =
  | {
      ok: true;
      clip: ClipPayload;
      /** 图片已替换成本地相对引用的正文（B站等元数据型剪藏为空串） */
      contentHtml: string;
      /** 自包含的离线快照（图片已内联）；失败或元数据型剪藏为 null */
      snapshotHtml: string | null;
      assets: ClipAssetPayload[];
    }
  | { ok: false; code: string; error: string };

export interface ClipApiDeps {
  pipeline: PipelineDeps;
  getClip?: (id: string) => Clip | null;
  listClips?: () => Clip[];
  readAsset?: (ref: AssetRef) => Buffer | null;
  /** 失败记录重试前要删掉（否则幂等键会一直跳过） */
  deleteClip?: (id: string) => void;
  /** 客户端/扩展直接提交的网页剪藏要落库（走它写 R2） */
  saveClip?: (clip: Clip) => Promise<void> | void;
}

/** 单次返回的资源总大小上限（base64 前）。超过就明确报错，不悄悄截断。 */
const MAX_ASSET_BYTES = 40 * 1024 * 1024;

export function validateClipUrl(input: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "缺少 url" };
  const raw = input.trim();
  if (!raw) return { ok: false, error: "缺少 url" };
  if (raw.length > 2048) return { ok: false, error: "网址过长（上限 2048 字符）" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "不是合法网址" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "只支持 http / https 链接" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "网址里不要带账号密码" };
  }
  return { ok: true, url: url.toString() };
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "html":
      return "text/html";
    default:
      return "application/octet-stream";
  }
}

/** 快照里的 `<img src="a1.png">` → data URL，让快照单文件可用 */
function inlineSnapshot(html: string, byFile: Map<string, ClipAssetPayload>): string {
  return html.replace(/(\bsrc\s*=\s*")([^"]+)(")/gi, (whole, pre: string, src: string, post: string) => {
    const asset = byFile.get(src);
    if (!asset) return whole;
    return `${pre}data:${asset.mime};base64,${asset.base64}${post}`;
  });
}

function payloadOf(clip: Clip): ClipPayload {
  return {
    id: clip.id,
    source: clip.source,
    sourceUrl: clip.sourceUrl,
    canonicalUrl: clip.canonicalUrl ?? null,
    title: clip.title,
    author: clip.author,
    account: clip.account,
    publishedAt: clip.publishedAt,
    savedAt: clip.savedAt,
    text: clip.text,
    status: clip.status,
    note: clip.note,
  };
}

/**
 * 同一篇文章的 id 候选。
 * 不能只比字符串：库里旧记录把 `==` 存成了 `%3D%3D`，直接比 sourceUrl 会漏。
 * 幂等 id 是按规范化 URL 算的，比 id 更可靠。
 */
function wantedIds(url: string): Set<string> {
  const ids = new Set<string>();
  try {
    ids.add(clipIdFor(url));
  } catch {
    /* ignore */
  }
  try {
    ids.add(clipIdFor(canonicalWechatArticleUrl(url).toString()));
  } catch {
    /* 非公众号链接：只有原始 id */
  }
  return ids;
}

function findExisting(list: () => Clip[], url: string): Clip | null {
  const ids = wantedIds(url);
  const all = list();
  const byId = all.find((c) => ids.has(c.id));
  if (byId) return byId;
  const normalized = url.replace(/#.*$/, "");
  return (
    all.find((c) => c.sourceUrl === url || c.canonicalUrl === url) ??
    all.find((c) => c.sourceUrl.replace(/#.*$/, "") === normalized) ??
    null
  );
}

/** 读资源 + 生成自包含快照（新剪藏与"库里已存在"两条路共用） */
function packAssets(
  clip: Clip,
  readAsset: (ref: AssetRef) => Buffer | null
): { assets: ClipAssetPayload[]; snapshotHtml: string | null } | { error: string } {
  const assets: ClipAssetPayload[] = [];
  const byFile = new Map<string, ClipAssetPayload>();
  let total = 0;
  for (const ref of clip.assets) {
    const data = readAsset(ref);
    if (!data) continue;
    total += data.length;
    if (total > MAX_ASSET_BYTES) {
      return { error: "这篇的图片总量超过 40MB，暂不支持一次导入" };
    }
    const payload: ClipAssetPayload = {
      assetId: ref.assetId,
      ext: ref.ext,
      mime: mimeFor(ref.ext),
      base64: data.toString("base64"),
    };
    assets.push(payload);
    byFile.set(`${ref.assetId}.${ref.ext}`, payload);
  }

  const snapshot = assets.find((a) => a.ext === "html");
  const snapshotHtml = snapshot
    ? inlineSnapshot(Buffer.from(snapshot.base64, "base64").toString("utf8"), byFile)
    : null;

  return { assets: assets.filter((a) => a.ext !== "html"), snapshotHtml };
}

/**
 * 处理一次剪藏请求。不碰 HTTP 对象，方便自测。
 */
export async function handleClipRequest(body: unknown, deps: ClipApiDeps): Promise<ClipApiResult> {
  const urlInput =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).url : undefined;
  const checked = validateClipUrl(urlInput);
  if (!checked.ok) return { ok: false, code: "invalid_url", error: checked.error };
  const url = checked.url;

  // 客户端/扩展**直接提交正文**（任意网页剪藏）：服务器不再自己抓，
  // 清洗后直接入库。公众号那种"服务器抓"的路子对普通网页不通用（正文要渲染）。
  const submitted = (body ?? {}) as Record<string, unknown>;
  if (typeof submitted.html === "string" && submitted.html.trim()) {
    const safeHtml = sanitizeContent(submitted.html, { allowDataImages: true });
    const text = htmlToText(safeHtml).trim();
    const title =
      String(submitted.title ?? "").trim() || htmlTitle(submitted.html) || url;
    const id = clipIdFor(url);
    const clip: Clip = {
      id,
      source: "unknown",
      sourceUrl: url,
      canonicalUrl: url,
      title,
      author: "",
      account: "",
      publishedAt: null,
      savedAt: new Date().toISOString(),
      text,
      assets: [],
      status: text ? "complete" : "partial",
      failReason: text ? null : "content_missing",
      note: "由客户端提交的网页剪藏",
    };
    await deps.saveClip?.(clip);
    return {
      ok: true,
      clip: payloadOf(clip),
      contentHtml: safeHtml,
      snapshotHtml: null,
      assets: [],
    };
  }

  const listFn = deps.listClips ?? listClips;
  const delFn = deps.deleteClip ?? deleteClip;
  // 失败记录会占住幂等键（existsClip → 永远跳过）。手动重试时先清掉它。
  const wanted = wantedIds(url);
  for (const old of listFn()) {
    if (old.status === "failed" && wanted.has(old.id)) delFn(old.id);
  }

  type Captured = Parameters<NonNullable<PipelineDeps["onArticle"]>>[0];
  // 用对象包一层：TypeScript 的控制流分析看不到回调里的赋值，直接写变量会被误判成永远为 null
  const box: { captured: Captured | null } = { captured: null };
  const pipeline: PipelineDeps = {
    ...deps.pipeline,
    onArticle: (info) => {
      box.captured = info;
    },
  };

  let stats: Awaited<ReturnType<typeof runPipeline>>;
  try {
    stats = await runPipeline([{ msgid: "clip-http", msgtype: "link", link: { url } }], pipeline);
  } catch (e) {
    return { ok: false, code: "internal", error: String((e as Error)?.message ?? e).slice(0, 200) };
  }

  const get = deps.getClip ?? getClip;
  const readAsset = deps.readAsset ?? readAssetFile;

  const captured = box.captured as Captured | null;
  const id = captured?.id ?? stats.clipIds[0];
  if (!id) {
    // 重复剪藏：库里已有同一篇，直接返回已有记录（正文不再重复传输）
    const existing = findExisting(listFn, url);
    if (existing?.status === "failed") {
      return { ok: false, code: existing.failReason ?? "fetch_failed", error: existing.note || "这条之前抓取失败，请重试" };
    }
    if (existing) {
      // 正文不再重复抓，但把已有的自包含快照带上：
      // 网页端可以据此导入正文（老记录只有快照、没有 contentHtml）。
      const packed = packAssets(existing, readAsset);
      if ("error" in packed) return { ok: false, code: "too_large", error: packed.error };
      return {
        ok: true,
        clip: payloadOf(existing),
        contentHtml: "",
        snapshotHtml: packed.snapshotHtml,
        assets: packed.assets,
      };
    }
    const failure = stats.failures[0];
    return {
      ok: false,
      code: failure?.reason ?? "unsupported",
      error:
        failure?.message ??
        (stats.skippedUnrecognized > 0
          ? "这条链接暂不支持：第一批只支持公众号文章与 B 站视频"
          : "没有识别到可剪藏的内容"),
    };
  }

  const clip = get(id);
  if (!clip) return { ok: false, code: "internal", error: "剪藏已入库但读不回来（存储层异常）" };
  if (clip.status === "failed") {
    // clip.note 只是来源说明；真正的失败原因在 stats.failures 里（风控/正文缺失/网络…）
    const failure =
      stats.failures.find((f) => f.reason === clip.failReason) ?? stats.failures[0];
    return {
      ok: false,
      code: clip.failReason ?? "fetch_failed",
      error: failure?.message || clip.note || "抓取失败，请确认链接可访问后重试",
    };
  }

  const packed = packAssets(clip, readAsset);
  if ("error" in packed) return { ok: false, code: "too_large", error: packed.error };

  return {
    ok: true,
    clip: payloadOf(clip),
    contentHtml: captured?.contentHtml ?? "",
    snapshotHtml: packed.snapshotHtml,
    assets: packed.assets,
  };
}

/** 给接口层用：已知幂等 id 时便于测试/排查 */
export function clipIdOf(url: string): string {
  return clipIdFor(url);
}
