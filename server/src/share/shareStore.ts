// 公开分享存储（W111 · 12 号模块 10）
//
// data/shares.json：
//   { version: 1, byToken: { <token>: { pageId, pageTitle, createdAt, revokedAt? } } }
//
// 语义（用户 2026-11-21 拍板）：
//   - 一个页面同时最多一个有效分享；重复开启返回已有 token（幂等）
//   - 关闭 = revokedAt 打标，token 立即失效
//   - 重新开启生成**新** token：旧链接拿到的人无法再访问，比复用旧 token 更安全
//   - token 22 位 base64url，不可枚举；链接永久有效直到关闭
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.ts";

export type ShareRecord = {
  pageId: string;
  pageTitle: string;
  createdAt: number;
  revokedAt?: number;
};

type ShareFile = { version: 1; byToken: Record<string, ShareRecord> };

const SHARE_FILE = path.join(DATA_DIR, "shares.json");
const MAX_PAGE_TITLE = 300;

let cached: ShareFile | null = null;

function load(): ShareFile {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(fs.readFileSync(SHARE_FILE, "utf8")) as ShareFile;
    if (parsed?.version === 1 && parsed.byToken && typeof parsed.byToken === "object") {
      cached = parsed;
      return cached;
    }
  } catch {
    /* 文件不存在或损坏：按空表起（损坏时会覆盖，分享可重建，不背旧脏数据） */
  }
  cached = { version: 1, byToken: {} };
  return cached;
}

function save(): void {
  if (!cached) return;
  fs.mkdirSync(path.dirname(SHARE_FILE), { recursive: true });
  const tmp = SHARE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cached, null, 1), "utf8");
  fs.renameSync(tmp, SHARE_FILE);
}

function newToken(): string {
  return crypto.randomBytes(16).toString("base64url"); // 22 字符
}

function sanitizeTitle(title: unknown): string {
  const raw = typeof title === "string" ? title : "";
  return raw.trim().slice(0, MAX_PAGE_TITLE) || "（无标题）";
}

/** 开启/刷新一个页面的公开分享（幂等：已有有效分享则原样返回） */
export function createShare(
  pageId: string,
  pageTitle: unknown,
): { token: string; pageId: string; pageTitle: string; createdAt: number; created: boolean } {
  const file = load();
  const title = sanitizeTitle(pageTitle);
  for (const [existing, rec] of Object.entries(file.byToken)) {
    if (rec.pageId === pageId && !rec.revokedAt) {
      // 页面标题变了要跟着更新（分享页头部显示用）
      if (rec.pageTitle !== title) {
        rec.pageTitle = title;
        save();
      }
      return { token: existing, pageId, pageTitle: title, createdAt: rec.createdAt, created: false };
    }
  }
  const token = newToken();
  const createdAt = Date.now();
  file.byToken[token] = { pageId, pageTitle: title, createdAt };
  save();
  return { token, pageId, pageTitle: title, createdAt, created: true };
}

/** 页面 → 当前有效分享（没有则 null） */
export function getShareByPage(pageId: string): (ShareRecord & { token: string }) | null {
  const file = load();
  for (const [token, rec] of Object.entries(file.byToken)) {
    if (rec.pageId === pageId && !rec.revokedAt) return { token, ...rec };
  }
  return null;
}

/** token → 有效分享（撤销过的一律不可见） */
export function getShareByToken(token: string): ShareRecord | null {
  const rec = load().byToken[token];
  if (!rec || rec.revokedAt) return null;
  return rec;
}

/** 关闭分享（打标撤销；没有过分享返回 false） */
export function revokeShare(pageId: string): boolean {
  const file = load();
  let hit = false;
  for (const rec of Object.values(file.byToken)) {
    if (rec.pageId === pageId && !rec.revokedAt) {
      rec.revokedAt = Date.now();
      hit = true;
    }
  }
  if (hit) save();
  return hit;
}

/** 测试用：清空内存缓存（数据目录切换后需要） */
export function resetShareStoreForTest(): void {
  cached = null;
}