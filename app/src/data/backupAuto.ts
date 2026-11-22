/**
 * 自动定时备份（M10-05 · W110 批次外补做）
 *
 * 落地形态：把整库快照写进**独立的第二个 IndexedDB**（`guanfu-backups.v1`）。
 * 为什么不是"写本地文件"：桌面端还没有 fs 插件（要加 Rust 依赖重编），浏览器也没有
 * 无感写盘的能力；独立库已经能做到「主库清空/损坏也不丢备份」这一步，
 * 与主库 `bijiapp.v3.store` 生命周期分开。导出成文件仍走手动 exportBackup。
 *
 * 策略（设置页「同步与凭证」里可调）：
 *   - 开关 + 间隔（1/6/12/24 小时），间隔默认 6 小时
 *   - 触发时机：应用启动 + 每小时心跳检查（到点才真正备）
 *   - 保留最近 5 份，超出自动删最旧
 *   - lastAt 记在 localStorage（不进主库，避免备份自己的状态又进备份）
 */
import Dexie from "dexie";
import { buildBackupPayload, restoreFromPayload } from "./backup";
import { useStore } from "./store";

const BACKUP_DB_NAME = "guanfu-backups.v1";
const KEEP_SNAPSHOTS = 5;
const CHECK_TICK_MS = 60 * 60 * 1000; // 每小时心跳，到点才备

const AUTO_KEY = "guanfu.backup.auto";

export type BackupAutoPrefs = { on: boolean; intervalHours: number };

type SnapshotRow = {
  id: string; // 时间戳字符串，天然按时间排序
  createdAt: number;
  pages: number;
  size: number;
  payload: string;
};

class BackupDB extends Dexie {
  snapshots!: Dexie.Table<SnapshotRow, string>;
  constructor() {
    super(BACKUP_DB_NAME);
    this.version(1).stores({ snapshots: "id, createdAt" });
  }
}

let db: BackupDB | null = null;
function getDb(): BackupDB {
  if (!db) db = new BackupDB();
  return db;
}

const DEFAULT_PREFS: BackupAutoPrefs = { on: true, intervalHours: 6 };

export function loadBackupAutoPrefs(): BackupAutoPrefs {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<BackupAutoPrefs>;
    return {
      on: parsed.on !== false,
      intervalHours: typeof parsed.intervalHours === "number" && parsed.intervalHours > 0 ? parsed.intervalHours : DEFAULT_PREFS.intervalHours,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveBackupAutoPrefs(prefs: BackupAutoPrefs): void {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage 不可用就算了 */
  }
}

export function loadBackupLastAt(): number {
  try {
    const v = Number(localStorage.getItem(AUTO_KEY + ".lastAt"));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function saveBackupLastAt(at: number): void {
  try {
    localStorage.setItem(AUTO_KEY + ".lastAt", String(at));
  } catch {
    /* ignore */
  }
}

/** 真正做一份快照（手动「立即备份」也走这里） */
export async function runBackupSnapshot(): Promise<{ id: string; pages: number; size: number }> {
  const { payload, pages } = await buildBackupPayload();
  const json = JSON.stringify(payload);
  const id = String(payload.exportedAt);
  await getDb().snapshots.put({ id, createdAt: payload.exportedAt, pages, size: json.length, payload: json });
  // 只保留最近 N 份
  const all = await getDb().snapshots.orderBy("createdAt").reverse().toArray();
  const stale = all.slice(KEEP_SNAPSHOTS).map((s) => s.id);
  if (stale.length) await getDb().snapshots.bulkDelete(stale);
  saveBackupLastAt(payload.exportedAt);
  return { id, pages, size: json.length };
}

/** 到点判断：开启 且 距上次 ≥ 间隔（首次使用视为该备） */
export function isBackupDue(now = Date.now()): boolean {
  const prefs = loadBackupAutoPrefs();
  if (!prefs.on) return false;
  const lastAt = loadBackupLastAt();
  return now - lastAt >= prefs.intervalHours * 60 * 60 * 1000;
}

/** 应用启动时调一次；内部再挂每小时心跳 */
export function startAutoBackup(): void {
  const tick = async () => {
    if (!isBackupDue()) return;
    // 关键：等主库 hydrate 完成再拍快照。否则启动竞态会抢在首篇页面写入前，
    // 备出一份 0 页的"空快照"——将来恢复它会清空用户数据。
    const deadline = Date.now() + 15000;
    while (!useStore.getState().ready && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!useStore.getState().ready) {
      console.error("[backup] 主库 15 秒未就绪，本轮自动备份跳过");
      return;
    }
    try {
      const r = await runBackupSnapshot();
      console.log(`[backup] 自动备份完成：${r.pages} 页 / ${(r.size / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.error("[backup] 自动备份失败：", e);
    }
  };
  void tick();
  window.setInterval(() => void tick(), CHECK_TICK_MS);
}

/** 设置页快照列表（最近在前） */
export async function listBackupSnapshots(): Promise<{ id: string; createdAt: number; pages: number; size: number }[]> {
  const all = await getDb().snapshots.orderBy("createdAt").reverse().toArray();
  return all.map(({ id, createdAt, pages, size }) => ({ id, createdAt, pages, size }));
}

/** 恢复某一份快照（**覆盖当前全部数据**，调用方先确认） */
export async function restoreBackupSnapshot(id: string): Promise<{ pages: number }> {
  const row = await getDb().snapshots.get(id);
  if (!row) throw new Error("这份快照不存在（可能已被清理）。");
  return restoreFromPayload(JSON.parse(row.payload));
}

export async function deleteBackupSnapshot(id: string): Promise<void> {
  await getDb().snapshots.delete(id);
}

/** 测试用：清空备份库与状态（独立 IndexedDB 在用例间会残留） */
export async function resetBackupDbForTest(): Promise<void> {
  await getDb().snapshots.clear();
  saveBackupLastAt(0);
}