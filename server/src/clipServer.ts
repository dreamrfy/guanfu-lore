// 剪藏 HTTP 服务（本地）
//
// 只监听 127.0.0.1，给网页端「快速剪藏」用。不引入框架，理由：
//  - 只有两个端点，Node 内置 http 足够；
//  - 少一个依赖就少一条供应链风险（这个服务会去抓外网）。
//
// 启动：node src/clipServer.ts [--port 8787]
// 环境变量：
//   CLIP_HTTP_PORT     端口（默认 8787）
//   CLIP_HTTP_ORIGINS  允许的来源，逗号分隔（默认本地 Vite 常用端口）
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { handleClipRequest } from "./clipApi.ts";
import { createLocalDeps } from "./pipeline/wire.ts";
import {
  conflictCount,
  currentSeq,
  listConflicts,
  pushChanges,
  readChanges,
  readRow,
  resolveConflict,
  upsertAssetIndex,
  getAssetIndex,
  validateHighlightInput,
  saveHighlight,
  listHighlightsByUrl,
  type PushChangeInput,
} from "./cloud/syncStore.ts";
import { getServerClip, listServerClips } from "./cloud/clipApi.ts";
import {
  MAX_ASSET_UPLOAD_BYTES,
  putAssetBytes,
  getAssetBytes,
  validateAssetUpload,
} from "./cloud/assetSync.ts";
import { R2ClipStore } from "./store/r2ClipStore.ts";
import { loadR2Config, getObject } from "./store/r2Store.ts";
import { createShare, getShareByPage, getShareByToken, revokeShare } from "./share/shareStore.ts";
import { collectAssetIds, renderShareHtml, renderShareNotFound } from "./share/sharePage.ts";

/** 读一个对象的原始字节（图片代理用） */
async function readAssetBytes(key: string): Promise<Uint8Array | null> {
  const cfg = loadR2Config(process.env);
  const buf = await getObject(cfg, key);
  return buf ?? null;
}

/** 读二进制请求体（资产上传用；与 readBody 不同：不转 utf8，上限 40MB） */
function readBodyRaw(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** 剪藏箱用的存储（懒初始化：没配 R2 时只有用到剪藏箱才会报错） */
let clipStoreInstance: R2ClipStore | null = null;
function clipStore(): R2ClipStore {
  if (!clipStoreInstance) {
    const cfg = loadR2Config(process.env);
    clipStoreInstance = new R2ClipStore(cfg);
    // 取件码之外的原始对象读取（快照 HTML）
    (clipStoreInstance as unknown as { readObject: (key: string) => Promise<Buffer | null> }).readObject = (
      key: string
    ) => getObject(cfg, key);
  }
  return clipStoreInstance;
}

const DEFAULT_PORT = 8787;
/** 请求体上限：只收一个 URL，16KB 已经非常宽松 */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * 访问 Token：剪藏服务要对外开时，必须带这个（否则任何人都能往你库里灌垃圾）。
 * 来源优先级：环境变量 CLIP_TOKEN → 文件 CLIP_TOKEN_FILE。
 * 都没配 = 不鉴权（只适合本机自用）。
 */
function readToken(): string {
  const fromEnv = process.env.CLIP_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = process.env.CLIP_TOKEN_FILE?.trim();
  if (file) {
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch {
      console.error(`[clip] 读不到 Token 文件：${file}`);
    }
  }
  return "";
}

/** 定长比较，避免时序侧信道 */
function tokenMatches(header: string | undefined, expected: string): boolean {
  if (!expected) return true;
  const provided = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

function parsePort(argv: string[]): number {
  const i = argv.indexOf("--port");
  const raw = i >= 0 ? argv[i + 1] : process.env.CLIP_HTTP_PORT;
  const port = Number(raw ?? DEFAULT_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

function allowedOrigins(): Set<string> {
  const raw = process.env.CLIP_HTTP_ORIGINS;
  return new Set(raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS);
}

function corsHeaders(origin: string | undefined, allowed: Set<string>): Record<string, string> {
  if (!origin || !allowed.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extra: Record<string, string> = {}
): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createClipServer(): http.Server {
  const allowed = allowedOrigins();
  const deps = createLocalDeps();
  const token = readToken();

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const cors = corsHeaders(origin, allowed);

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { ok: true, service: "bijiapp-clip", pid: process.pid }, cors);
      return;
    }

    // 公开分享（W111/W112）：/s/<token> 匿名只读。token 本身就是钥匙，不走鉴权。
    // 图片走 /s/<token>/a/<assetId>，只放行本页正文里出现过的附件。
    // 注意：这段在 `const url` 声明之前，路径要从 req.url 现取。
    const sharePath = (req.url ?? "").split("?")[0].match(/^\/s\/([A-Za-z0-9_-]{10,64})(?:\/a\/([A-Za-z0-9_-]{1,64}))?$/);
    if (req.method === "GET" && sharePath) {
      const [, shareToken, assetId] = sharePath;
      const share = getShareByToken(shareToken);
      if (!share) {
        res.writeHead(404, {
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
          "Cache-Control": "no-store",
        });
        res.end(renderShareNotFound());
        return;
      }
      const row = readRow("page", share.pageId);
      const payload =
        row && !row.deleted && row.payload ? (row.payload as { page?: Record<string, unknown>; blocks?: unknown[] }) : null;
      if (assetId) {
        const allowed = collectAssetIds(payload?.blocks ?? []);
        const idx = allowed.has(assetId) ? getAssetIndex(assetId) : null;
        if (!idx) {
          sendJson(res, 404, { ok: false, code: "asset_not_found", error: "附件不存在或不属于该分享" });
          return;
        }
        const buf = await readAssetBytes(`assets/${assetId}.${idx.ext}`);
        if (!buf) {
          sendJson(res, 404, { ok: false, code: "asset_not_found", error: "附件不存在" });
          return;
        }
        const ext = idx.ext.toLowerCase();
        const contentType =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "png"
              ? "image/png"
              : ext === "gif"
                ? "image/gif"
                : ext === "webp"
                  ? "image/webp"
                  : ext === "svg"
                    ? "image/svg+xml"
                    : ext === "pdf"
                      ? "application/pdf"
                      : "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" });
        res.end(buf);
        return;
      }
      const ok = Boolean(payload);
      const html = payload
        ? renderShareHtml((payload.page ?? {}) as { title?: unknown; updatedAt?: unknown }, payload.blocks ?? [])
        : renderShareNotFound();
      res.writeHead(ok ? 200 : 404, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    const url = (req.url ?? "").split("?")[0];
    const known =
      (req.method === "POST" && url === "/api/clip") ||
      (req.method === "GET" && url === "/api/clips") ||
      (req.method === "GET" && url === "/api/asset") ||
      (req.method === "GET" && url.startsWith("/api/clips/")) ||
      (req.method === "POST" && url === "/api/sync/pull") ||
      (req.method === "POST" && url === "/api/sync/push") ||
      (req.method === "POST" && url === "/api/sync/conflicts/resolve") ||
      (req.method === "POST" && url === "/api/sync/assets") ||
      (req.method === "GET" && url.startsWith("/api/sync/assets/")) ||
      (req.method === "GET" && url === "/api/sync/row") ||
      (req.method === "GET" && url === "/api/sync/conflicts") ||
      (req.method === "POST" && url === "/api/highlights") ||
      (req.method === "GET" && url === "/api/highlights") ||
      (req.method === "POST" && url === "/api/share") ||
      (req.method === "GET" && url === "/api/share") ||
      (req.method === "DELETE" && url === "/api/share");
    if (!known) {
      sendJson(
        res,
        404,
        { ok: false, code: "not_found", error: "未知接口（/api/clip、/api/sync/*）" },
        cors
      );
      return;
    }

    // 对外开时必须带 Token（没配 CLIP_TOKEN 则本机自用，不鉴权）
    if (!tokenMatches(req.headers.authorization, token)) {
      sendJson(
        res,
        401,
        { ok: false, code: "unauthorized", error: "缺少或错误的访问 Token（Authorization: Bearer …）" },
        cors
      );
      return;
    }

    // 资源中转：浏览器直连 R2 会被 CORS 拦，图片走服务器代理（桶不用配 CORS）
    if (req.method === "GET" && url === "/api/asset") {
      const key = new URL(req.url ?? "http://x", "http://x").searchParams.get("key") ?? "";
      if (!key.startsWith("assets/") || key.includes("..")) {
        sendJson(res, 400, { ok: false, code: "bad_key", error: "只能取 assets/ 下的资源" }, cors);
        return;
      }
      try {
        const buf = await readAssetBytes(key);
        if (!buf) {
          sendJson(res, 404, { ok: false, code: "not_found", error: "资源不存在" }, cors);
          return;
        }
        const ext = key.split(".").pop()?.toLowerCase() ?? "png";
        const contentType =
          ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "png"
              ? "image/png"
              : ext === "gif"
                ? "image/gif"
                : ext === "webp"
                  ? "image/webp"
                  : ext === "svg"
                    ? "image/svg+xml"
                    : ext === "html"
                      ? "text/html; charset=utf-8"
                      : "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "private, max-age=300", ...cors });
        res.end(Buffer.from(buf));
      } catch (e) {
        sendJson(res, 500, { ok: false, code: "internal", error: String((e as Error)?.message ?? e).slice(0, 120) }, cors);
      }
      return;
    }

    // 服务器剪藏箱：微信转发自动入库的那些（只读）
    if (req.method === "GET" && url === "/api/clips") {
      try {
        sendJson(res, 200, await listServerClips(clipStore()), cors);
      } catch (e) {
        sendJson(res, 500, { ok: false, code: "internal", error: `读剪藏清单失败：${String((e as Error)?.message ?? e).slice(0, 120)}` }, cors);
      }
      return;
    }
    if (req.method === "GET" && url.startsWith("/api/clips/")) {
      const id = decodeURIComponent(url.slice("/api/clips/".length));
      try {
        const result = await getServerClip(clipStore(), id);
        sendJson(res, result.ok ? 200 : 404, result, cors);
      } catch (e) {
        sendJson(res, 500, { ok: false, code: "internal", error: String((e as Error)?.message ?? e).slice(0, 120) }, cors);
      }
      return;
    }

    // 网页划线（H01 扩展上报 / H03 客户端按页面读取）：引文三件套存 SQLite
    if (req.method === "POST" && url === "/api/highlights") {
      let body: string;
      try {
        body = await readBody(req);
      } catch {
        sendJson(res, 413, { ok: false, code: "body_too_large", error: "请求体过大" }, cors);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { ok: false, code: "bad_json", error: "请求体不是合法 JSON" }, cors);
        return;
      }
      const v = validateHighlightInput(parsed);
      if (!v.ok) {
        sendJson(res, 400, { ok: false, code: v.code, error: v.error }, cors);
        return;
      }
      const result = saveHighlight(v.value);
      sendJson(res, 200, { ok: true, id: result.id, created: result.created, highlight: result.row }, cors);
      return;
    }
    if (req.method === "GET" && url === "/api/highlights") {
      const pageUrl = new URL(req.url ?? "http://x", "http://x").searchParams.get("pageUrl") ?? "";
      if (!pageUrl.trim()) {
        sendJson(res, 400, { ok: false, code: "missing_page_url", error: "缺少 pageUrl 参数" }, cors);
        return;
      }
      const items = listHighlightsByUrl(pageUrl);
      sendJson(res, 200, { ok: true, pageUrl, items }, cors);
      return;
    }

    // 取某一行当前内容（客户端做冲突差异对比用）
    if (req.method === "GET" && url === "/api/sync/row") {
      const query = new URL(req.url ?? "http://x", "http://x").searchParams;
      const entity = query.get("entity") ?? "";
      const entityId = query.get("entityId") ?? "";
      const row = readRow(entity, entityId);
      if (!row) {
        sendJson(res, 404, { ok: false, code: "not_found", error: "服务器上没有这一行" }, cors);
        return;
      }
      sendJson(res, 200, { ok: true, entity, entityId, ...row }, cors);
      return;
    }

    // 公开分享管理（W111/W113）：页面级开关 + 链接。
    // 链接域名固定用公开分享域（KF_SHARE_HOST，默认 share.guanfu.app）——
    // 不能跟着请求 Host 走：App 调 API 走的是 clip 域，链接必须落在用户拍板的 share 域上。
    // 仅本地联调（localhost/127.0.0.1）时跟随请求 Host，方便起服务直测。
    if (url === "/api/share") {
      const host = req.headers.host ?? "";
      const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
      const shareHost = process.env.KF_SHARE_HOST?.trim() || "share.guanfu.app";
      const shareOrigin = isLocal ? `http://${host}` : `https://${shareHost}`;
      const shareUrl = (token: string) => `${shareOrigin}/s/${token}`;
      if (req.method === "POST") {
        let body: { pageId?: unknown };
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          body = {};
        }
        const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
        if (!pageId) {
          sendJson(res, 400, { ok: false, code: "bad_page_id", error: "缺少 pageId" }, cors);
          return;
        }
        const row = readRow("page", pageId);
        if (!row || row.deleted || !row.payload) {
          sendJson(res, 404, { ok: false, code: "page_not_found", error: "这个页面还没同步到服务器（先开一次同步）" }, cors);
          return;
        }
        const page = (row.payload as { page?: { title?: unknown } }).page ?? {};
        const result = createShare(pageId, page.title);
        sendJson(res, 200, { ok: true, ...result, url: shareUrl(result.token) }, cors);
        return;
      }
      if (req.method === "GET") {
        const query = new URL(req.url ?? "http://x", "http://x").searchParams;
        const pageId = (query.get("pageId") ?? "").trim();
        if (!pageId) {
          sendJson(res, 400, { ok: false, code: "bad_page_id", error: "缺少 pageId" }, cors);
          return;
        }
        const share = getShareByPage(pageId);
        sendJson(
          res,
          200,
          {
            ok: true,
            shared: Boolean(share),
            url: share ? shareUrl(share.token) : null,
            createdAt: share?.createdAt ?? null,
          },
          cors,
        );
        return;
      }
      if (req.method === "DELETE") {
        let body: { pageId?: unknown };
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          body = {};
        }
        const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
        if (!pageId) {
          sendJson(res, 400, { ok: false, code: "bad_page_id", error: "缺少 pageId" }, cors);
          return;
        }
        revokeShare(pageId);
        sendJson(res, 200, { ok: true, shared: false }, cors);
        return;
      }
    }

    // 资产上传（S01）：assetId/ext 走 query，图片字节走 body（二进制，不走 JSON 门）
    if (req.method === "POST" && url === "/api/sync/assets") {
      const query = new URL(req.url ?? "http://x", "http://x").searchParams;
      const v = validateAssetUpload(query.get("assetId") ?? undefined, query.get("ext") ?? undefined);
      if (!v.ok) {
        sendJson(res, 400, { ok: false, code: v.code, error: v.error }, cors);
        return;
      }
      let body: Buffer;
      try {
        body = await readBodyRaw(req, MAX_ASSET_UPLOAD_BYTES);
      } catch {
        sendJson(res, 413, { ok: false, code: "body_too_large", error: `资产超过 ${MAX_ASSET_UPLOAD_BYTES} 字节上限` }, cors);
        return;
      }
      if (body.length === 0) {
        sendJson(res, 400, { ok: false, code: "empty_body", error: "请求体为空" }, cors);
        return;
      }
      try {
        const stored = await putAssetBytes(v.assetId, v.ext, body);
        upsertAssetIndex({
          assetId: stored.assetId,
          ext: stored.ext,
          mime: stored.mime,
          size: stored.size,
          sha256: stored.sha256,
          storage: stored.storage,
          objectKey: stored.key,
        });
        sendJson(res, 200, { ok: true, ...stored }, cors);
      } catch (e) {
        sendJson(res, 500, { ok: false, code: "internal", error: `资产落库失败：${String((e as Error)?.message ?? e).slice(0, 120)}` }, cors);
      }
      return;
    }

    // 资产下载（S01）：按索引路由到 R2 或本地盘
    if (req.method === "GET" && url.startsWith("/api/sync/assets/")) {
      const assetId = decodeURIComponent(url.slice("/api/sync/assets/".length));
      try {
        const meta = getAssetIndex(assetId);
        if (!meta) {
          sendJson(res, 404, { ok: false, code: "not_found", error: "服务器上没有这个资产" }, cors);
          return;
        }
        const bytes = await getAssetBytes(meta.assetId, meta.ext);
        if (!bytes) {
          sendJson(res, 404, { ok: false, code: "not_found", error: "资产索引在但字节缺失" }, cors);
          return;
        }
        res.writeHead(200, {
          "Content-Type": meta.mime,
          "Cache-Control": "private, max-age=31536000, immutable",
          ...cors,
        });
        res.end(Buffer.from(bytes));
      } catch (e) {
        sendJson(res, 500, { ok: false, code: "internal", error: String((e as Error)?.message ?? e).slice(0, 120) }, cors);
      }
      return;
    }

    // 冲突列表是 GET，不需要请求体
    if (req.method === "GET") {
      sendJson(
        res,
        200,
        { ok: true, conflicts: listConflicts(), count: conflictCount() },
        cors
      );
      return;
    }

    // 浏览器跨源 POST 的 Content-Type 必须是 application/json（避免被当成简单请求）
    if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      sendJson(res, 415, { ok: false, code: "bad_content_type", error: "请用 application/json" }, cors);
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      const tooLarge = (e as Error)?.message === "body_too_large";
      sendJson(
        res,
        tooLarge ? 413 : 400,
        { ok: false, code: tooLarge ? "body_too_large" : "bad_json", error: tooLarge ? "请求体过大" : "JSON 解析失败" },
        cors
      );
      return;
    }

    try {
      if (url === "/api/clip") {
        const result = await handleClipRequest(body, {
          pipeline: deps,
          // 客户端/扩展直接提交的网页剪藏：落到 R2（和微信轮询那批同一个桶）
          saveClip: async (clip) => {
            clipStore().saveClip(clip);
          },
        });
        sendJson(res, result.ok ? 200 : 422, result, cors);
        return;
      }

      if (url === "/api/sync/pull") {
        const input = (body ?? {}) as { since?: number; limit?: number };
        const since = Number.isFinite(input.since) ? Number(input.since) : 0;
        const limit = Number.isFinite(input.limit) ? Math.min(Number(input.limit), 500) : 200;
        const changes = readChanges(since, limit);
        sendJson(res, 200, { ok: true, changes, nextSeq: currentSeq() }, cors);
        return;
      }

      if (url === "/api/sync/push") {
        const input = (body ?? {}) as { changes?: PushChangeInput[] };
        const results = pushChanges(input.changes ?? []);
        sendJson(res, 200, { ok: true, results, nextSeq: currentSeq() }, cors);
        return;
      }

      if (url === "/api/sync/conflicts/resolve") {
        const input = (body ?? {}) as { id?: number; action?: "keep-server" | "use-mine" };
        if (typeof input.id !== "number" || (input.action !== "keep-server" && input.action !== "use-mine")) {
          sendJson(res, 400, { ok: false, code: "bad_request", error: "需要 id 与 action(keep-server|use-mine)" }, cors);
          return;
        }
        const result = resolveConflict(input.id, input.action);
        sendJson(res, result.ok ? 200 : 404, { ok: result.ok, seq: result.seq }, cors);
        return;
      }
    } catch (e) {
      console.error("[clip] 未处理异常", e);
      sendJson(
        res,
        500,
        { ok: false, code: "internal", error: String((e as Error)?.message ?? e).slice(0, 200) },
        cors
      );
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = parsePort(process.argv.slice(2));
  // 容器里要监听 0.0.0.0：Docker 的端口转发打的是容器网卡地址，
  // 只听 127.0.0.1 的话"容器内健康检查通过、宿主端口却连不上"。
  // 对外是否暴露由 Docker 的端口绑定决定（compose 里只绑 127.0.0.1）。
  const host = process.env.CLIP_HOST?.trim() || "127.0.0.1";
  const server = createClipServer();
  server.listen(port, host, () => {
    console.log(`[clip] 剪藏接口已启动：http://${host}:${port}`);
    console.log(`[clip] 健康检查：http://${host}:${port}/api/health`);
    console.log(`[clip] 允许的来源：${[...allowedOrigins()].join(", ")}`);
    console.log(`[clip] 访问 Token：${readToken() ? "已启用（CLIP_TOKEN/CLIP_TOKEN_FILE）" : "未启用（本机自用模式）"}`);
  });
}
