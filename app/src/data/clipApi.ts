/**
 * 剪藏服务的网页端客户端。
 *
 * 服务端在 server/（node src/clipServer.ts），只监听 127.0.0.1。
 * 这里只做三件事：读配置、发请求、把"服务没起来/返回不对"翻译成人话。
 */
import { repo } from "./db";

export const DEFAULT_CLIP_SERVER = "http://127.0.0.1:8787";
const SERVER_KEY = "clipServerUrl";
const TOKEN_KEY = "clipToken";

export type ClipAsset = {
  assetId: string;
  ext: string;
  mime: string;
  /** base64（不带 data: 前缀） */
  base64: string;
};

export type ClipPayload = {
  id: string;
  source: string;
  sourceUrl: string;
  canonicalUrl: string | null;
  title: string;
  author: string;
  account: string;
  publishedAt: string | null;
  savedAt: string;
  text: string;
  status: string;
  note?: string;
};

export type ClipResult =
  | {
      ok: true;
      clip: ClipPayload;
      /** 图片已替换为本地相对引用的正文；重复剪藏时可能为空 */
      contentHtml: string;
      /** 自包含快照（图片已内联）；元数据型剪藏可能为 null */
      snapshotHtml: string | null;
      assets: ClipAsset[];
    }
  | { ok: false; code: string; error: string };

export async function loadClipServerUrl(): Promise<string> {
  const saved = await repo.getMeta<string>(SERVER_KEY);
  return typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_CLIP_SERVER;
}

export async function saveClipServerUrl(url: string): Promise<void> {
  await repo.setMeta(SERVER_KEY, url.trim() || DEFAULT_CLIP_SERVER);
}

/** 访问 Token：云上剪藏服务对外开时会要求它（服务端配了 CLIP_TOKEN 才需要填） */
export async function loadClipToken(): Promise<string> {
  const saved = await repo.getMeta<string>(TOKEN_KEY);
  return typeof saved === "string" ? saved : "";
}

export async function saveClipToken(token: string): Promise<void> {
  await repo.setMeta(TOKEN_KEY, token.trim());
}

export async function requestClip(url: string): Promise<ClipResult> {
  const server = await loadClipServerUrl();
  const token = await loadClipToken();
  let res: Response;
  try {
    res = await fetch(`${server}/api/clip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url }),
    });
  } catch {
    return {
      ok: false,
      code: "server_unreachable",
      error: `连不上剪藏服务（${server}）。请先在 server/ 目录运行：node src/clipServer.ts`,
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      code: "unauthorized",
      error: "剪藏服务拒绝了请求：Token 不对或没填（点「剪藏服务地址」把 Token 填上）",
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, code: "bad_response", error: `剪藏服务返回了非 JSON（HTTP ${res.status}）` };
  }

  if (!data || typeof data !== "object" || !("ok" in data)) {
    return { ok: false, code: "bad_response", error: "剪藏服务返回格式不对" };
  }
  return data as ClipResult;
}
