// 本地存储（provider = "local"）：SQLite 落库（node:sqlite，零依赖）+ 资源落盘
//
// 接口与“云上实现”对齐：换成 CloudBase 数据库/R2 时，只换实现，不改上层（G1/G4）。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ASSETS_DIR } from "../config.ts";
import type { AssetRef, Clip } from "./types.ts";

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "clips.db"));
  db.exec(`CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_url TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    account TEXT NOT NULL DEFAULT '',
    published_at TEXT,
    saved_at TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    fail_reason TEXT,
    note TEXT,
    assets_json TEXT NOT NULL DEFAULT '[]'
  )`);
  return db;
}

/** 关闭数据库连接（测试收尾用；Windows 下不关连接就无法删目录） */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

const ASSET_ID_RE = /^[0-9a-f]{8,16}$/;
const EXT_RE = /^[a-z0-9]{2,5}$/;

/** 落盘一个资源文件（路径由本模块常量拼出并做边界校验，不掺外部内容） */
export function writeAssetFile(assetId: string, ext: string, body: Buffer): string {
  if (!ASSET_ID_RE.test(assetId)) throw new Error("非法 assetId");
  if (!EXT_RE.test(ext)) throw new Error("非法扩展名");
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const abs = path.resolve(ASSETS_DIR, assetId + "." + ext);
  if (!abs.startsWith(ASSETS_DIR + path.sep)) throw new Error("输出路径越界");
  fs.writeFileSync(abs, body);
  return abs;
}

/** 读取已落盘的资源文件（不存在返回 null） */
export function readAssetFile(ref: AssetRef): Buffer | null {
  if (!ASSET_ID_RE.test(ref.assetId) || !EXT_RE.test(ref.ext)) return null;
  const abs = path.resolve(ASSETS_DIR, ref.assetId + "." + ref.ext);
  if (!abs.startsWith(ASSETS_DIR + path.sep) || !fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}

export function saveClip(clip: Clip): void {
  const d = getDb();
  d.prepare(
    `INSERT OR REPLACE INTO clips
     (id, source, source_url, title, author, account, published_at, saved_at, text, status, fail_reason, note, assets_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    clip.id,
    clip.source,
    clip.sourceUrl,
    clip.title,
    clip.author,
    clip.account,
    clip.publishedAt,
    clip.savedAt,
    clip.text,
    clip.status,
    clip.failReason ?? null,
    clip.note ?? null,
    JSON.stringify(clip.assets)
  );
}

function rowToClip(row: Record<string, unknown>): Clip {
  return {
    id: String(row.id),
    source: row.source as Clip["source"],
    sourceUrl: String(row.source_url),
    title: String(row.title),
    author: String(row.author ?? ""),
    account: String(row.account ?? ""),
    publishedAt: (row.published_at as string) ?? null,
    savedAt: String(row.saved_at),
    text: String(row.text ?? ""),
    assets: JSON.parse(String(row.assets_json ?? "[]")) as AssetRef[],
    status: row.status as Clip["status"],
    failReason: (row.fail_reason as string) ?? null,
    note: (row.note as string) ?? undefined,
  };
}

export function getClip(id: string): Clip | null {
  const row = getDb().prepare("SELECT * FROM clips WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToClip(row) : null;
}

/** 幂等检查：该 id 是否已入库 */
export function existsClip(id: string): boolean {
  return !!getDb().prepare("SELECT id FROM clips WHERE id = ?").get(id);
}

export function listClips(): Clip[] {
  const rows = getDb().prepare("SELECT id FROM clips ORDER BY saved_at").all() as Array<{ id: string }>;
  return rows.map((r) => getClip(r.id)).filter((c): c is Clip => c !== null);
}
