// 公开分享客户端（W111）：复用剪藏/同步的服务地址与 Token。
// 面板语义（W113）：
//   - 一个页面一个有效链接；开启幂等，关闭即撤销（旧链接立即失效）
//   - 链接永久有效直到关闭；对方无需登录，只读
import { loadClipServerUrl, loadClipToken } from "./clipApi";

export type ShareState = {
  shared: boolean;
  url: string | null;
  createdAt: number | null;
};

function trimBase(server: string): string {
  return server.replace(/\/+$/, "");
}

async function shareHeaders(): Promise<HeadersInit> {
  const token = await loadClipToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function call<T>(
  path: string,
  init: { method: "POST" | "GET" | "DELETE"; body?: string },
): Promise<T> {
  const server = trimBase(await loadClipServerUrl());
  let res: Response;
  try {
    res = await fetch(`${server}${path}`, {
      method: init.method,
      headers: await shareHeaders(),
      ...(init.body ? { body: init.body } : {}),
    });
  } catch {
    throw new Error(`连不上剪藏服务（${server}），无法使用公开分享。`);
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `服务端返回 ${res.status}`);
  }
  return json as T;
}

export async function fetchShareState(pageId: string): Promise<ShareState> {
  const json = await call<{ shared?: boolean; url?: string | null; createdAt?: number | null }>(
    `/api/share?pageId=${encodeURIComponent(pageId)}`,
    { method: "GET" },
  );
  return {
    shared: Boolean(json.shared),
    url: typeof json.url === "string" ? json.url : null,
    createdAt: typeof json.createdAt === "number" ? json.createdAt : null,
  };
}

export async function createPublicShare(pageId: string): Promise<ShareState> {
  const json = await call<{ url?: string }>(
    "/api/share",
    { method: "POST", body: JSON.stringify({ pageId }) },
  );
  return { shared: true, url: typeof json.url === "string" ? json.url : null, createdAt: null };
}

export async function revokePublicShare(pageId: string): Promise<ShareState> {
  await call("/api/share", { method: "DELETE", body: JSON.stringify({ pageId }) });
  return { shared: false, url: null, createdAt: null };
}