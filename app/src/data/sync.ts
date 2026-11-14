/**
 * 同步引擎（决策 D4：服务器为准 + 离线队列 + 冲突副本）
 *
 * 三步：
 *  1. 拉：按游标增量拉服务器变更，写进本地库（服务器版本覆盖本地）
 *  2. 推：把本地 outbox 队列推上去；服务器按乐观锁判断能不能应用
 *  3. 冲突：推不上去的（别人先改了）→ 本地存成冲突副本，绝不静默丢
 *
 * 同步接口与剪藏接口在**同一个服务**上，所以地址和 Token 复用剪藏的配置。
 */
import { repo, type OutboxRow, type PageRow, type CollectionRow, type RecordRow } from "./db";
import { loadClipServerUrl, loadClipToken } from "./clipApi";

export type SyncEntity = "page" | "collection" | "record";

export type RemoteChange = {
  seq: number;
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  /** JSON 字符串 */
  payload: string | null;
  actor: string;
  baseSeq: number;
  createdAt: number;
};

export type PushResult = {
  entityId: string;
  status: "applied" | "conflict";
  seq: number;
  conflictId?: number;
};

export type SyncSummary = {
  ok: boolean;
  pulled: number;
  pushed: number;
  conflicts: number;
  /** 拉到并已写进本地库的变更（界面用它刷新内存里的状态） */
  applied: LocalChange[];
  error?: string;
};

const CURSOR_KEY = "syncCursor";
const SEQS_KEY = "syncSeqs";

/** 设备标识（用于在冲突副本上标出"谁改的"） */
function deviceId(): string {
  const raw = localStorage.getItem("bijiapp.deviceId") ?? "";
  if (raw) return raw;
  const id = "dev-" + Math.random().toString(36).slice(2, 8);
  localStorage.setItem("bijiapp.deviceId", id);
  return id;
}

/* ---------------- 纯函数（可单测） ---------------- */

/**
 * 合并同一行的多次本地改动：只留最新的一条。
 * 否则"打字 10 次"会在队列里堆 10 条，推的时候互相打架。
 */
export function coalesceOutbox(
  existing: OutboxRow[],
  incoming: Omit<OutboxRow, "id" | "createdAt">
): OutboxRow[] {
  const others = existing.filter(
    (row) => !(row.entity === incoming.entity && row.entityId === incoming.entityId)
  );
  return [
    ...others,
    {
      ...incoming,
      createdAt: Date.now(),
    },
  ];
}

export function buildPushPayload(rows: OutboxRow[]): Array<{
  entity: string;
  entityId: string;
  op: string;
  payload: unknown;
  baseSeq: number;
  actor: string;
}> {
  return rows.map((row) => ({
    entity: row.entity,
    entityId: row.entityId,
    op: row.op,
    payload: row.payload,
    baseSeq: row.baseSeq,
    actor: row.actor,
  }));
}

/** 服务器回来的变更 → 本地该写成什么 */
export function parseRemoteChange(change: RemoteChange): {
  entity: SyncEntity;
  entityId: string;
  op: "upsert" | "delete";
  payload: unknown;
} | null {
  if (change.entity !== "page" && change.entity !== "collection" && change.entity !== "record") {
    return null;
  }
  let payload: unknown = null;
  if (change.payload) {
    try {
      payload = JSON.parse(change.payload);
    } catch {
      return null;
    }
  }
  return {
    entity: change.entity,
    entityId: change.entityId,
    op: change.op,
    payload,
  };
}

/* ---------------- 本地状态（游标 / 版本号） ---------------- */

export async function getCursor(): Promise<number> {
  const raw = await repo.getMeta<number>(CURSOR_KEY);
  return typeof raw === "number" ? raw : 0;
}

export async function setCursor(value: number): Promise<void> {
  await repo.setMeta(CURSOR_KEY, value);
}

export async function getSeqs(): Promise<Record<string, number>> {
  const raw = await repo.getMeta<Record<string, number>>(SEQS_KEY);
  return raw && typeof raw === "object" ? raw : {};
}

export async function setSeqs(seqs: Record<string, number>): Promise<void> {
  await repo.setMeta(SEQS_KEY, seqs);
}

export function seqKey(entity: string, entityId: string): string {
  return `${entity}:${entityId}`;
}

/* ---------------- 入队 ---------------- */

/**
 * 记一条本地改动（待推送）。
 * 同一行只保留最新的一条；baseSeq 用当前已知的服务器版本号（乐观锁）。
 */
export async function enqueueChange(input: {
  entity: SyncEntity;
  entityId: string;
  op: "upsert" | "delete";
  payload: unknown;
}): Promise<void> {
  const seqs = await getSeqs();
  const rows = await repo.listOutbox();
  const merged = coalesceOutbox(rows, {
    entity: input.entity,
    entityId: input.entityId,
    op: input.op,
    payload: input.payload,
    baseSeq: seqs[seqKey(input.entity, input.entityId)] ?? 0,
    actor: deviceId(),
  });
  // 先删掉同行的旧条目再写入（合并后的那一条）
  for (const row of rows) {
    if (row.entity === input.entity && row.entityId === input.entityId && row.id !== undefined) {
      await repo.deleteOutbox(row.id);
    }
  }
  await repo.putOutbox(merged[merged.length - 1]!);
}

export async function pendingCount(): Promise<number> {
  return (await repo.listOutbox()).length;
}

export async function conflictList(): Promise<
  Array<{ id: number; entity: string; entityId: string; payload: unknown; serverSeq: number; createdAt: number }>
> {
  const rows = await repo.listSyncConflicts();
  return rows.map((row) => ({
    id: row.id ?? 0,
    entity: row.entity,
    entityId: row.entityId,
    payload: row.payload,
    serverSeq: row.serverSeq,
    createdAt: row.createdAt,
  }));
}

/* ---------------- 与服务器对话 ---------------- */

async function post(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const server = await loadClipServerUrl();
  const token = await loadClipToken();
  const res = await fetch(`${server}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, data };
}

/* ---------------- 应用远端变更到本地库 ---------------- */

export type LocalChange = {
  entity: SyncEntity;
  entityId: string;
  op: "upsert" | "delete";
  payload: unknown;
};

/**
 * 把远端变更写进本地 IndexedDB。
 * 页面要一起写正文（docs 表），否则另一台设备的正文对不上。
 */
export async function applyRemoteToDb(change: LocalChange): Promise<void> {
  if (change.entity === "page") {
    const payload = change.payload as { page?: PageRow; blocks?: unknown[] } | null;
    if (change.op === "delete") {
      if (payload?.page) {
        await repo.putPage({ ...payload.page, deletedAt: payload.page.deletedAt ?? Date.now() });
      }
      return;
    }
    if (!payload?.page) return;
    await repo.putPage(payload.page);
    if (payload.blocks) await repo.putDoc(payload.page.id, payload.blocks);
    return;
  }
  if (change.entity === "collection") {
    const payload = change.payload as { collection?: CollectionRow } | null;
    if (!payload?.collection) return;
    if (change.op === "delete") await repo.deleteCollection(payload.collection.id);
    else await repo.putCollection(payload.collection);
    return;
  }
  if (change.entity === "record") {
    const payload = change.payload as { record?: RecordRow } | null;
    if (!payload?.record) return;
    if (change.op === "delete") await repo.deleteRecord(payload.record.id);
    else await repo.putRecord(payload.record);
  }
}

/* ---------------- 一次完整同步 ---------------- */

export async function runSync(): Promise<SyncSummary> {
  const summary: SyncSummary = { ok: false, pulled: 0, pushed: 0, conflicts: 0, applied: [] };
  try {
    // 1) 拉
    const cursor = await getCursor();
    const pull = await post("/api/sync/pull", { since: cursor, limit: 500 });
    if (pull.status !== 200 || !pull.data?.ok) {
      summary.error = pull.data?.error ?? `拉取失败（HTTP ${pull.status}）`;
      return summary;
    }
    const changes: RemoteChange[] = pull.data.changes ?? [];
    const seqs = await getSeqs();
    for (const change of changes) {
      const parsed = parseRemoteChange(change);
      if (!parsed) continue;
      await applyRemoteToDb(parsed);
      seqs[seqKey(change.entity, change.entityId)] = change.seq;
      summary.pulled += 1;
      summary.applied.push(parsed);
    }
    await setSeqs(seqs);
    await setCursor(Number(pull.data.nextSeq ?? cursor));

    // 2) 推
    const outbox = await repo.listOutbox();
    if (outbox.length > 0) {
      const push = await post("/api/sync/push", { changes: buildPushPayload(outbox) });
      if (push.status !== 200 || !push.data?.ok) {
        summary.error = push.data?.error ?? `推送失败（HTTP ${push.status}）`;
        return summary;
      }
      const results: PushResult[] = push.data.results ?? [];
      const byEntity = new Map(outbox.map((row) => [row.entityId, row]));
      for (const result of results) {
        const row = byEntity.get(result.entityId);
        if (!row || row.id === undefined) continue;
        if (result.status === "applied") {
          seqs[seqKey(row.entity, row.entityId)] = result.seq;
          await repo.deleteOutbox(row.id);
          summary.pushed += 1;
        } else {
          // 冲突：本地版本存成副本，等用户决定
          await repo.putSyncConflict({
            entity: row.entity,
            entityId: row.entityId,
            payload: row.payload,
            serverSeq: result.seq,
            createdAt: Date.now(),
          });
          await repo.deleteOutbox(row.id);
          summary.conflicts += 1;
        }
      }
      await setSeqs(seqs);
    }

    summary.ok = true;
    return summary;
  } catch (e) {
    summary.error = String((e as Error)?.message ?? e).slice(0, 200);
    return summary;
  }
}

/**
 * 直接推一条改动（带指定的 baseSeq）。
 * 冲突合并要用它：合并结果的基准是"服务器当前版本"，不是本地记录的旧版本。
 */
export async function pushDirectChange(input: {
  entity: SyncEntity;
  entityId: string;
  payload: unknown;
  baseSeq: number;
}): Promise<{ ok: boolean; status?: "applied" | "conflict"; seq?: number; error?: string }> {
  const push = await post("/api/sync/push", {
    changes: [
      {
        entity: input.entity,
        entityId: input.entityId,
        op: "upsert",
        payload: input.payload,
        baseSeq: input.baseSeq,
        actor: deviceId(),
      },
    ],
  });
  if (push.status !== 200 || !push.data?.ok) {
    return { ok: false, error: push.data?.error ?? `推送失败（HTTP ${push.status}）` };
  }
  const result = push.data.results?.[0];
  return { ok: true, status: result?.status, seq: result?.seq };
}

/**
 * 处理一个本地冲突副本：
 *  - keep-server：丢掉我的版本（服务器版本为准）
 *  - use-mine：把我的版本再推一次（覆盖服务器版本，并留痕）
 */
export async function resolveLocalConflict(
  id: number,
  action: "keep-server" | "use-mine"
): Promise<{ ok: boolean; error?: string }> {
  const conflicts = await conflictList();
  const conflict = conflicts.find((c) => c.id === id);
  if (!conflict) return { ok: false, error: "冲突副本不存在" };
  if (action === "use-mine") {
    await enqueueChange({
      entity: conflict.entity as SyncEntity,
      entityId: conflict.entityId,
      op: "upsert",
      payload: conflict.payload,
    });
  }
  await repo.deleteSyncConflict(id);
  return { ok: true };
}
