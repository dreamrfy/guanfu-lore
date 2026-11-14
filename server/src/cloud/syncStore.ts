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
    CREATE INDEX IF NOT EXISTS change_log_entity ON change_log (entity, entity_id);
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
