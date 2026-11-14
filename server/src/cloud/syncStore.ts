// 同步存储（决策 D4：服务器为准 + 离线队列 + 冲突副本）
//
// 三个表：
//   sync_rows      每行数据的"当前版本"（seq 是它的版本号，客户端拿它做乐观锁）
//   change_log     变更流水（客户端按 seq 增量拉取；也是推送的审计依据）
//   sync_conflicts 冲突副本（客户端的版本没能覆盖服务器时，原样存下来等人处理）
//
// 为什么不用"最后写入胜出"就完事：那样会静默丢用户的编辑。
// 我们的做法是：能安全合并就合并（同一行没被别人动过），不能就留副本，绝不假装没冲突。
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.ts";

export type SyncOp = "upsert" | "delete";

/** 允许同步的实体（白名单：别的名字一律拒绝） */
export const SYNC_ENTITIES = ["page", "collection", "record"] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

/** 单次推送的载荷上限（正文可能很大，但 2MB 足够一篇长文） */
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_CHANGES_PER_PUSH = 200;
const MAX_ACTOR_LEN = 64;

export type SyncChange = {
  seq: number;
  entity: string;
  entityId: string;
  op: SyncOp;
  /** JSON 字符串（delete 时为 null） */
  payload: string | null;
  actor: string;
  baseSeq: number;
  createdAt: number;
};

export type PushChangeInput = {
  entity: string;
  entityId: string;
  op: SyncOp;
  payload?: unknown;
  baseSeq: number;
  actor?: string;
};

export type PushResult = {
  entityId: string;
  status: "applied" | "conflict";
  /** 应用后的版本号（冲突时是服务器当前版本） */
  seq: number;
  conflictId?: number;
};

export type ConflictCopy = {
  id: number;
  entity: string;
  entityId: string;
  actor: string;
  payload: unknown;
  createdAt: number;
};

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "sync.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_rows (
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      payload TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity, entity_id)
    );
    CREATE TABLE IF NOT EXISTS change_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT,
      actor TEXT NOT NULL DEFAULT '',
      base_seq INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asset_index (
      asset_id TEXT PRIMARY KEY,
      ext TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      storage TEXT NOT NULL,
      object_key TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS change_log_entity ON change_log (entity, entity_id);
    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      page_url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      quote_exact TEXT NOT NULL,
      quote_prefix TEXT NOT NULL DEFAULT '',
      quote_suffix TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS highlights_page_url ON highlights (page_url);
  `);
  return db;
}

/** 测试收尾用：Windows 下不关连接就无法删目录 */
export function closeSyncDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/* ---- 资产索引（S01：字节进对象存储，元数据进这里）---- */

export type AssetIndexRow = {
  assetId: string;
  ext: string;
  mime: string;
  size: number;
  sha256: string;
  storage: string;
  objectKey: string;
  actor: string;
  createdAt: number;
};

/** 上传后登记（同 assetId 重复上传覆盖：键 immutable 语义，内容应相同） */
export function upsertAssetIndex(row: {
  assetId: string;
  ext: string;
  mime: string;
  size: number;
  sha256: string;
  storage: string;
  objectKey: string;
  actor?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO asset_index (asset_id, ext, mime, size, sha256, storage, object_key, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(asset_id) DO UPDATE SET
         ext=excluded.ext, mime=excluded.mime, size=excluded.size, sha256=excluded.sha256,
         storage=excluded.storage, object_key=excluded.object_key, created_at=excluded.created_at`
    )
    .run(
      row.assetId,
      row.ext,
      row.mime,
      row.size,
      row.sha256,
      row.storage,
      row.objectKey,
      row.actor ?? "",
      nowMs()
    );
}

export function getAssetIndex(assetId: string): AssetIndexRow | null {
  const r = getDb()
    .prepare(
      `SELECT asset_id, ext, mime, size, sha256, storage, object_key, actor, created_at
       FROM asset_index WHERE asset_id = ?`
    )
    .get(assetId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    assetId: String(r.asset_id),
    ext: String(r.ext),
    mime: String(r.mime),
    size: Number(r.size),
    sha256: String(r.sha256),
    storage: String(r.storage),
    objectKey: String(r.object_key),
    actor: String(r.actor),
    createdAt: Number(r.created_at),
  };
}

/* ---- 划线（H02：网页划线高亮，按页面 URL 存取）----
 * 契约来自 H01（extension/content.js 上报）：
 *   { pageUrl, title, quote: { exact, prefix, suffix } }
 * 存储键 id = 页面 URL + 三件套引文的哈希 → 同一处重复划线天然幂等（重报不重记）。
 */

export type HighlightRow = {
  id: string;
  pageUrl: string;
  title: string;
  quote: { exact: string; prefix: string; suffix: string };
  createdAt: number;
};

/** 长度上限：exact 与 extension/locator.js 的选区上限（2000）对齐；引文两端 locator 只发 32，留一倍余量 */
export const HIGHLIGHT_LIMITS = {
  maxPageUrl: 2048,
  maxTitle: 300,
  maxExact: 2000,
  maxQuoteSide: 64,
} as const;

export function highlightId(pageUrl: string, exact: string, prefix: string, suffix: string): string {
  return crypto
    .createHash("sha256")
    .update(pageUrl + "\u0000" + exact + "\u0000" + prefix + "\u0000" + suffix, "utf8")
    .digest("hex")
    .slice(0, 16);
}

export type ValidHighlight = {
  pageUrl: string;
  title: string;
  quote: { exact: string; prefix: string; suffix: string };
};

export function validateHighlightInput(
  raw: unknown
): { ok: true; value: ValidHighlight } | { ok: false; code: string; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, code: "bad_payload", error: "请求体必须是 JSON 对象" };
  }
  const o = raw as Record<string, unknown>;
  const pageUrl = typeof o.pageUrl === "string" ? o.pageUrl.trim() : "";
  if (!pageUrl) return { ok: false, code: "missing_page_url", error: "缺少 pageUrl（划线所在的页面地址）" };
  if (pageUrl.length > HIGHLIGHT_LIMITS.maxPageUrl) {
    return { ok: false, code: "page_url_too_long", error: `pageUrl 超过 ${HIGHLIGHT_LIMITS.maxPageUrl} 字` };
  }
  const q =
    typeof o.quote === "object" && o.quote !== null ? (o.quote as Record<string, unknown>) : null;
  const exact = q && typeof q.exact === "string" ? q.exact : "";
  if (!exact.trim()) return { ok: false, code: "missing_quote", error: "缺少 quote.exact（选中的原文）" };
  if (exact.length > HIGHLIGHT_LIMITS.maxExact) {
    return {
      ok: false,
      code: "quote_too_long",
      error: `quote.exact 超过 ${HIGHLIGHT_LIMITS.maxExact} 字（防误选整页）`,
    };
  }
  const prefix = q && typeof q.prefix === "string" ? q.prefix : "";
  const suffix = q && typeof q.suffix === "string" ? q.suffix : "";
  if (prefix.length > HIGHLIGHT_LIMITS.maxQuoteSide || suffix.length > HIGHLIGHT_LIMITS.maxQuoteSide) {
    return {
      ok: false,
      code: "quote_side_too_long",
      error: `quote.prefix/suffix 超过 ${HIGHLIGHT_LIMITS.maxQuoteSide} 字`,
    };
  }
  const title = typeof o.title === "string" ? o.title.trim().slice(0, HIGHLIGHT_LIMITS.maxTitle) : "";
  return { ok: true, value: { pageUrl, title, quote: { exact, prefix, suffix } } };
}

function rowToHighlight(r: Record<string, unknown>): HighlightRow {
  return {
    id: String(r.id),
    pageUrl: String(r.page_url),
    title: String(r.title),
    quote: {
      exact: String(r.quote_exact),
      prefix: String(r.quote_prefix),
      suffix: String(r.quote_suffix),
    },
    createdAt: Number(r.created_at),
  };
}

/** 落一条划线；同一处（id 相同）重复上报不重记，返回 created=false 和已存的记录 */
export function saveHighlight(value: ValidHighlight): { id: string; created: boolean; row: HighlightRow } {
  const id = highlightId(
    value.pageUrl,
    value.quote.exact,
    value.quote.prefix,
    value.quote.suffix
  );
  const existing = getHighlight(id);
  if (existing) return { id, created: false, row: existing };
  const createdAt = nowMs();
  getDb()
    .prepare(
      `INSERT INTO highlights (id, page_url, title, quote_exact, quote_prefix, quote_suffix, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, value.pageUrl, value.title, value.quote.exact, value.quote.prefix, value.quote.suffix, createdAt);
  return {
    id,
    created: true,
    row: {
      id,
      pageUrl: value.pageUrl,
      title: value.title,
      quote: { ...value.quote },
      createdAt,
    },
  };
}

export function getHighlight(id: string): HighlightRow | null {
  const r = getDb()
    .prepare(`SELECT id, page_url, title, quote_exact, quote_prefix, quote_suffix, created_at FROM highlights WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return r ? rowToHighlight(r) : null;
}

/** 按页面地址取全部划线（按划的先后顺序，客户端渲染用） */
export function listHighlightsByUrl(pageUrl: string, limit = 200): HighlightRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, page_url, title, quote_exact, quote_prefix, quote_suffix, created_at
       FROM highlights WHERE page_url = ? ORDER BY created_at ASC, id ASC LIMIT ?`
    )
    .all(pageUrl, limit) as Record<string, unknown>[];
  return rows.map(rowToHighlight);
}

function nowMs(): number {
  return Date.now();
}

function isEntity(entity: string): entity is SyncEntity {
  return (SYNC_ENTITIES as readonly string[]).includes(entity);
}

function sanitizeActor(actor: unknown): string {
  const text = typeof actor === "string" ? actor : "";
  return text.slice(0, MAX_ACTOR_LEN);
}

function serializePayload(payload: unknown): string {
  const text = JSON.stringify(payload ?? null);
  if (Buffer.byteLength(text, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error("单条变更超过 2MB 限制");
  }
  return text;
}

/** 当前全局变更序号（客户端第一次同步时用它当游标起点） */
export function currentSeq(): number {
  const row = getDb().prepare("SELECT MAX(seq) AS seq FROM change_log").get() as { seq?: number };
  return row?.seq ?? 0;
}

/** 某行当前的版本号（0 = 从没同步过） */
export function rowSeq(entity: string, entityId: string): number {
  const row = getDb()
    .prepare("SELECT seq FROM sync_rows WHERE entity = ? AND entity_id = ?")
    .get(entity, entityId) as { seq?: number } | undefined;
  return row?.seq ?? 0;
}

/** 写一行并记流水（服务器本地改动 & 客户端推送都走这里） */
export function applyChange(input: {
  entity: string;
  entityId: string;
  op: SyncOp;
  payload?: unknown;
  actor?: string;
  baseSeq?: number;
}): { seq: number } {
  if (!isEntity(input.entity)) throw new Error(`未知实体：${input.entity}`);
  const database = getDb();
  const payload = input.op === "delete" ? null : serializePayload(input.payload);
  const actor = sanitizeActor(input.actor);
  const createdAt = nowMs();

  const info = database
    .prepare(
      "INSERT INTO change_log (entity, entity_id, op, payload, actor, base_seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(input.entity, input.entityId, input.op, payload, actor, input.baseSeq ?? 0, createdAt);
  const seq = Number(info.lastInsertRowid);

  database
    .prepare(
      `INSERT INTO sync_rows (entity, entity_id, seq, payload, deleted, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity, entity_id) DO UPDATE SET seq = excluded.seq, payload = excluded.payload,
         deleted = excluded.deleted, updated_at = excluded.updated_at`
    )
    .run(input.entity, input.entityId, seq, payload, input.op === "delete" ? 1 : 0, createdAt);

  return { seq };
}

/** 增量拉取：seq 大于 since 的变更 */
export function readChanges(since: number, limit = 200): SyncChange[] {
  const rows = getDb()
    .prepare(
      `SELECT seq, entity, entity_id, op, payload, actor, base_seq, created_at
       FROM change_log WHERE seq > ? ORDER BY seq ASC LIMIT ?`
    )
    .all(since, limit) as Array<{
    seq: number;
    entity: string;
    entity_id: string;
    op: SyncOp;
    payload: string | null;
    actor: string;
    base_seq: number;
    created_at: number;
  }>;
  return rows.map((r) => ({
    seq: r.seq,
    entity: r.entity,
    entityId: r.entity_id,
    op: r.op,
    payload: r.payload,
    actor: r.actor,
    baseSeq: r.base_seq,
    createdAt: r.created_at,
  }));
}

/**
 * 客户端推一批改动上来。
 * - 行的当前版本号 ≤ 客户端看到的版本 → 安全，直接应用；
 * - 客户端看到的版本 < 当前版本 → 别人改过：不动服务器，把客户端版本存成冲突副本。
 */
export function pushChanges(changes: PushChangeInput[]): PushResult[] {
  if (!Array.isArray(changes)) throw new Error("changes 必须是数组");
  if (changes.length > MAX_CHANGES_PER_PUSH) {
    throw new Error(`一次最多推 ${MAX_CHANGES_PER_PUSH} 条`);
  }
  const results: PushResult[] = [];
  for (const change of changes) {
    if (!isEntity(change.entity)) throw new Error(`未知实体：${change.entity}`);
    const current = rowSeq(change.entity, change.entityId);
    const baseSeq = Number.isFinite(change.baseSeq) ? Number(change.baseSeq) : 0;

    if (baseSeq < current) {
      // 冲突：不覆盖，存副本
      const payload = serializePayload(change.payload);
      const info = getDb()
        .prepare(
          "INSERT INTO sync_conflicts (entity, entity_id, actor, payload, created_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run(change.entity, change.entityId, sanitizeActor(change.actor), payload, nowMs());
      results.push({
        entityId: change.entityId,
        status: "conflict",
        seq: current,
        conflictId: Number(info.lastInsertRowid),
      });
      continue;
    }

    const { seq } = applyChange({
      entity: change.entity,
      entityId: change.entityId,
      op: change.op,
      payload: change.payload,
      actor: change.actor,
      baseSeq,
    });
    results.push({ entityId: change.entityId, status: "applied", seq });
  }
  return results;
}

/** 某行当前的版本与内容（客户端做差异对比时用；只给已知的实体白名单内的行） */
export function readRow(
  entity: string,
  entityId: string
): { seq: number; payload: unknown; deleted: boolean } | null {
  if (!isEntity(entity)) return null;
  const row = getDb()
    .prepare("SELECT seq, payload, deleted FROM sync_rows WHERE entity = ? AND entity_id = ?")
    .get(entity, entityId) as { seq?: number; payload?: string | null; deleted?: number } | undefined;
  if (!row) return null;
  return {
    seq: row.seq ?? 0,
    payload: row.payload ? safeParse(row.payload) : null,
    deleted: !!row.deleted,
  };
}

export function listConflicts(limit = 100): ConflictCopy[] {
  const rows = getDb()
    .prepare(
      "SELECT id, entity, entity_id, actor, payload, created_at FROM sync_conflicts ORDER BY id DESC LIMIT ?"
    )
    .all(limit) as Array<{
    id: number;
    entity: string;
    entity_id: string;
    actor: string;
    payload: string;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    entityId: r.entity_id,
    actor: r.actor,
    payload: safeParse(r.payload),
    createdAt: r.created_at,
  }));
}

/**
 * 处理一个冲突副本：
 *  - keep-server：丢弃本地版本（服务器版本为准）
 *  - use-mine：把本地版本作为一次新变更推上去（覆盖服务器版本，并留痕）
 */
export function resolveConflict(id: number, action: "keep-server" | "use-mine"): { ok: boolean; seq?: number } {
  const row = getDb()
    .prepare("SELECT id, entity, entity_id, actor, payload FROM sync_conflicts WHERE id = ?")
    .get(id) as
    | { id: number; entity: string; entity_id: string; actor: string; payload: string }
    | undefined;
  if (!row) return { ok: false };

  if (action === "use-mine") {
    const { seq } = applyChange({
      entity: row.entity,
      entityId: row.entity_id,
      op: "upsert",
      payload: safeParse(row.payload),
      actor: row.actor,
    });
    getDb().prepare("DELETE FROM sync_conflicts WHERE id = ?").run(id);
    return { ok: true, seq };
  }

  getDb().prepare("DELETE FROM sync_conflicts WHERE id = ?").run(id);
  return { ok: true };
}

export function conflictCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM sync_conflicts").get() as { n: number };
  return row?.n ?? 0;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
