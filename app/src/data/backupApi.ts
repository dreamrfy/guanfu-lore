// 服务端备份客户端（M10-05 服务端半边）：复用剪藏服务地址与 Token。
// 服务端未配 R2 时返回 r2_not_configured，这里转成可读文案。
import { loadClipServerUrl, loadClipToken } from "./clipApi";

export type ServerBackupItem = { key: string; ts: number; pages: number; size: number };

function trimBase(server: string): string {
  return server.replace(/\/+$/, "");
}

async function headers(): Promise<HeadersInit> {
  const token = await loadClipToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function call<T>(path: string, init: { method: "POST" | "GET"; body?: string }): Promise<T> {
  const server = trimBase(await loadClipServerUrl());
  let res: Response;
  try {
    res = await fetch(`${server}${path}`, { method: init.method, headers: await headers(), ...(init.body ? { body: init.body } : {}) });
  } catch {
    throw new Error(`连不上剪藏服务（${server}）`);
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
  if (!res.ok || json.ok === false) {
    const msg =
      json.code === "r2_not_configured"
        ? "服务端未配置 R2 存储，无法使用服务端备份"
        : json.error ?? `服务端返回 ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export async function uploadServerBackup(payload: string, pages: number): Promise<ServerBackupItem> {
  const json = await call<ServerBackupItem>("/api/backup", { method: "POST", body: payload });
  return { key: json.key, ts: json.ts, pages: json.pages ?? pages, size: json.size ?? payload.length };
}

export async function listServerBackups(): Promise<ServerBackupItem[]> {
  const json = await call<{ items?: ServerBackupItem[] }>("/api/backup", { method: "GET" });
  return Array.isArray(json.items) ? json.items : [];
}

export async function fetchServerBackup(key: string): Promise<unknown> {
  const json = await call<{ payload?: unknown }>(`/api/backup/get?key=${encodeURIComponent(key)}`, { method: "GET" });
  return json.payload ?? null;
}