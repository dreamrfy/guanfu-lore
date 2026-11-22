// 服务端整库备份存储（M10-05 的服务端半边：快照进 R2，跨设备保险）
//
// data/backups.json 元数据：{ version: 1, items: [{ key, ts, pages, size }] }（最新在前，cap 50）
// 对象键：backups/backup-<ts>.json
// R2 未配置时报 r2_not_configured，前端据实提示。
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.ts";
import { getObject, listObjectKeys, putObject } from "../store/r2Store.ts";
import { loadR2Config, type R2Config } from "../store/r2Store.ts";

export type BackupMeta = { key: string; ts: number; pages: number; size: number };

const META_FILE = path.join(DATA_DIR, "backups.json");
const BACKUP_PREFIX = "backups/";
const META_CAP = 50;

let cached: { version: 1; items: BackupMeta[] } | null = null;

function loadMeta(): { version: 1; items: BackupMeta[] } {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(fs.readFileSync(META_FILE, "utf8")) as {
      version?: number;
      items?: unknown;
    };
    if (parsed?.version === 1 && Array.isArray(parsed.items)) {
      cached = parsed as { version: 1; items: BackupMeta[] };
      return cached;
    }
  } catch {
    /* 空起 */
  }
  cached = { version: 1, items: [] };
  return cached;
}

function saveMeta(): void {
  if (!cached) return;
  fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  const tmp = META_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cached, null, 1), "utf8");
  fs.renameSync(tmp, META_FILE);
}

function safeConfig(): R2Config | null {
  try {
    return loadR2Config();
  } catch {
    return null;
  }
}

export function r2Configured(): boolean {
  return safeConfig() !== null;
}

/** 上传一份备份快照（整库 JSON，约 0.1–2MB） */
export async function uploadBackup(
  payload: string,
  pages: number,
): Promise<BackupMeta> {
  const cfg = safeConfig();
  if (!cfg) throw new Error("r2_not_configured");
  let parsed: { exportedAt?: number };
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("bad_json");
  }
  const ts = typeof parsed.exportedAt === "number" ? parsed.exportedAt : Date.now();
  const key = `${BACKUP_PREFIX}backup-${ts}.json`;
  await putObject(cfg, key, Buffer.from(payload, "utf8"), { contentType: "application/json" });
  const meta = loadMeta();
  const item: BackupMeta = { key, ts, pages, size: payload.length };
  meta.items = [item, ...meta.items.filter((x) => x.key !== key)].slice(0, META_CAP);
  saveMeta();
  return item;
}

/** 列出服务端备份（最新在前） */
export function listBackups(): BackupMeta[] {
  return [...loadMeta().items];
}

/** 下载一份备份快照（恢复用） */
export async function downloadBackup(key: string): Promise<string | null> {
  if (!key.startsWith(BACKUP_PREFIX) || key.includes("..")) throw new Error("bad_key");
  const cfg = safeConfig();
  if (!cfg) throw new Error("r2_not_configured");
  // key 里带时间戳，实际对象可能带不同后缀——meta 里记录的键就是全键
  const known = loadMeta().items.some((x) => x.key === key);
  if (!known) return null;
  const buf = await getObject(cfg, key);
  return buf ? buf.toString("utf8") : null;
}

/** 测试用：清空内存缓存 */
export function resetBackupMetaForTest(): void {
  cached = null;
}

/** 兜底：meta 丢失时从 R2 列表重建（按前缀） */
export async function reconcileFromR2(): Promise<number> {
  const cfg = safeConfig();
  if (!cfg) throw new Error("r2_not_configured");
  const keys = await listObjectKeys(cfg, { prefix: BACKUP_PREFIX, maxKeys: 100 });
  const meta = loadMeta();
  for (const key of keys) {
    if (!meta.items.some((x) => x.key === key)) {
      const ts = Number(key.replace(BACKUP_PREFIX + "backup-", "").replace(".json", "")) || Date.now();
      meta.items.push({ key, ts, pages: 0, size: 0 });
    }
  }
  meta.items.sort((a, b) => b.ts - a.ts);
  saveMeta();
  return meta.items.length;
}