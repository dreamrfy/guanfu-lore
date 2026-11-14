/**
 * AI 冲突辅助（用户需求）：
 *
 *  1. 把"服务器版本"和"我的版本"的差异**高亮**出来；
 *  2. 由 AI 判断：两边是不是**改了同一处**；
 *     - 不是同一处 → 直接合并进云端最新（两边的改动都保留）；
 *     - 是同一处 → 不自动动，**继续保留副本**，交给用户挑。
 *
 * 为什么要 AI 判：块 id 相同但文字被双方各自改写时，靠 id 看不出"同一处"；
 * 而段落被整体重写（id 都变了）时，靠 id 又会误判成"两处不同"。语义判断更靠谱。
 *
 * 没配 AI 时：**只高亮、不自动合并**（宁可让人看一眼，也不擅自改内容）。
 */
import { chat, loadAiConfig, type ChatMessage } from "./ai";
import { loadClipServerUrl, loadClipToken } from "./clipApi";
import { blockText } from "./ragIndex";
import { pushDirectChange, type SyncEntity } from "./sync";

export type LiteBlock = { id: string; text: string };

export type DiffKind = "same" | "changed" | "serverOnly" | "mineOnly";

export type DiffBlock = {
  id: string;
  text: string;
  kind: DiffKind;
  /** 另一边的文字（kind=changed 时有用） */
  otherText?: string;
};

/**
 * 从 payload 里取出可对比的块（页面正文 / 记录正文）。
 * 注意：正文块放在**顶层**（`{page, blocks}`），有的版本放在 `page.blocks` 里——两种都要认。
 */
export function payloadBlocks(payload: unknown): LiteBlock[] | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const page = obj.page as { blocks?: unknown[] } | undefined;
  if (page) {
    const source = Array.isArray(obj.blocks)
      ? obj.blocks
      : Array.isArray(page.blocks)
        ? page.blocks
        : [];
    return toLite(source);
  }
  const record = obj.record as { doc?: unknown[] } | undefined;
  if (record) {
    const source = Array.isArray(obj.doc)
      ? obj.doc
      : Array.isArray(record.doc)
        ? record.doc
        : [];
    return toLite(source);
  }
  return null; // 集合（表结构）是结构化数据，不走块级合并
}

function toLite(blocks: unknown[]): LiteBlock[] {
  const out: LiteBlock[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    const text = blockText(block.content);
    if (!text) continue;
    out.push({ id: typeof block.id === "string" ? block.id : `b${out.length}`, text });
  }
  return out;
}

/** 按块 id 做 LCS 对齐，产出差异序列 */
export function diffBlocks(server: LiteBlock[], mine: LiteBlock[]): DiffBlock[] {
  const serverIds = server.map((b) => b.id);
  const mineIds = mine.map((b) => b.id);
  const n = server.length;
  const m = mine.length;

  // LCS 长度表
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        serverIds[i] === mineIds[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: DiffBlock[] = [];
  const serverById = new Map(server.map((b) => [b.id, b]));
  const mineById = new Map(mine.map((b) => [b.id, b]));

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (serverIds[i] === mineIds[j]) {
      const a = server[i]!;
      const b = mine[j]!;
      out.push(
        a.text === b.text
          ? { id: a.id, text: a.text, kind: "same" }
          : { id: a.id, text: a.text, kind: "changed", otherText: b.text }
      );
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ id: serverIds[i]!, text: server[i]!.text, kind: "serverOnly" });
      i++;
    } else {
      out.push({ id: mineIds[j]!, text: mine[j]!.text, kind: "mineOnly" });
      j++;
    }
  }
  while (i < n) {
    out.push({ id: serverIds[i]!, text: server[i]!.text, kind: "serverOnly" });
    i++;
  }
  while (j < m) {
    out.push({ id: mineIds[j]!, text: mine[j]!.text, kind: "mineOnly" });
    j++;
  }

  void serverById;
  void mineById;
  return out;
}

/** 差异里有没有"同一处被两边各改一次" */
export function hasSameSpotChange(diff: DiffBlock[]): boolean {
  return diff.some((d) => d.kind === "changed");
}

/** 按差异把两边合并（只在"不是同一处"时用）：服务器的编辑 + 我的新增 */
export function mergeByDiff(
  server: LiteBlock[],
  mine: LiteBlock[],
  diff: DiffBlock[]
): LiteBlock[] {
  const mineById = new Map(mine.map((b) => [b.id, b]));
  const serverById = new Map(server.map((b) => [b.id, b]));
  const merged: LiteBlock[] = [];
  for (const item of diff) {
    if (item.kind === "same" || item.kind === "changed") {
      merged.push(serverById.get(item.id) ?? { id: item.id, text: item.text });
    } else if (item.kind === "serverOnly") {
      merged.push(serverById.get(item.id) ?? { id: item.id, text: item.text });
    } else {
      merged.push(mineById.get(item.id) ?? { id: item.id, text: item.text });
    }
  }
  return merged;
}

/** 取出 payload 里的原始块数组（保留完整结构：类型、属性都在里面） */
function payloadRawBlocks(payload: unknown): { raw: unknown[]; topLevel: boolean } | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (obj.page) {
    const page = obj.page as { blocks?: unknown[] };
    if (Array.isArray(obj.blocks)) return { raw: obj.blocks, topLevel: true };
    if (Array.isArray(page.blocks)) return { raw: page.blocks, topLevel: false };
    return { raw: [], topLevel: true };
  }
  if (obj.record) {
    const record = obj.record as { doc?: unknown[] };
    if (Array.isArray(obj.doc)) return { raw: obj.doc, topLevel: true };
    if (Array.isArray(record.doc)) return { raw: record.doc, topLevel: false };
    return { raw: [], topLevel: true };
  }
  return null;
}

/**
 * 合并两个 payload：服务器的编辑 + 我的新增（两边都保留）。
 * 返回合并后的 payload；形状对不上（一边有 blocks 一边没有）时返回 null。
 */
export function mergePayloadBlocks(serverPayload: unknown, myPayload: unknown): unknown | null {
  const serverRaw = payloadRawBlocks(serverPayload);
  const myRaw = payloadRawBlocks(myPayload);
  if (!serverRaw || !myRaw) return null;

  const serverBlocks = toLite(serverRaw.raw);
  const myBlocks = toLite(myRaw.raw);
  const diff = diffBlocks(serverBlocks, myBlocks);

  const serverById = new Map(serverRaw.raw.map((raw, index) => [serverBlocks[index]?.id, raw] as const));
  const myById = new Map(myRaw.raw.map((raw, index) => [myBlocks[index]?.id, raw] as const));

  // 合并后的块序列：同一 id 取服务器的（我方改动另行处理），只在我有的新增块插进来
  const mergedRaw: unknown[] = [];
  for (const item of diff) {
    if (item.kind === "mineOnly") {
      const raw = myById.get(item.id);
      if (raw) mergedRaw.push(raw);
    } else {
      const raw = serverById.get(item.id);
      if (raw) mergedRaw.push(raw);
    }
  }

  const target = serverPayload as Record<string, unknown>;
  const next: Record<string, unknown> = { ...target };
  if (serverRaw.topLevel) {
    if ("page" in target) next.blocks = mergedRaw;
    else next.doc = mergedRaw;
  } else if (target.page) {
    next.page = { ...(target.page as object), blocks: mergedRaw };
  } else if (target.record) {
    next.record = { ...(target.record as object), doc: mergedRaw };
  }
  return next;
}

/** 把合并后的块写回 payload（保持原来的形状：顶层 blocks 还是 page.blocks） */
export function applyMergedBlocks(payload: unknown, blocks: LiteBlock[]): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const obj = payload as Record<string, unknown>;

  const mergeInto = (source: unknown[]): unknown[] => {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    return source
      .map((raw) => {
        if (!raw || typeof raw !== "object") return raw;
        const block = raw as Record<string, unknown>;
        const id = typeof block.id === "string" ? block.id : "";
        const lit = byId.get(id);
        if (!lit) return raw;
        return { ...block, content: [{ type: "text", text: lit.text, styles: {} }] };
      })
      .filter(Boolean);
  };

  const page = obj.page as { blocks?: unknown[] } | undefined;
  if (page) {
    const topLevel = Array.isArray(obj.blocks);
    const source = topLevel ? (obj.blocks as unknown[]) : (page.blocks ?? []);
    const merged = mergeInto(source);
    const next: Record<string, unknown> = { ...obj, page: { ...page } };
    if (topLevel) next.blocks = merged;
    else (next.page as Record<string, unknown>).blocks = merged;
    return next;
  }

  const record = obj.record as { doc?: unknown[] } | undefined;
  if (record) {
    const topLevel = Array.isArray(obj.doc);
    const source = topLevel ? (obj.doc as unknown[]) : (record.doc ?? []);
    const merged = mergeInto(source);
    const next: Record<string, unknown> = { ...obj, record: { ...record } };
    if (topLevel) next.doc = merged;
    else (next.record as Record<string, unknown>).doc = merged;
    return next;
  }

  return payload;
}

/* ---------------- 判定提示词 ---------------- */

export function buildJudgeMessages(
  serverBlocks: LiteBlock[],
  myBlocks: LiteBlock[],
  diff: DiffBlock[]
): ChatMessage[] {
  const system =
    '你是冲突合并助手。判断两个版本是不是「改了同一处」。只输出 JSON：{"sameSpot":true 或 false,"reason":"一句话理由","merged":"当 sameSpot=false 时给出合并后的正文（保留双方内容）"}';
  const describe = diff
    .map((item) => {
      const label =
        item.kind === "same"
          ? "两边一致"
          : item.kind === "changed"
            ? "同一处被两边改成了不同文字"
            : item.kind === "serverOnly"
              ? "只有服务器有"
              : "只有我有";
      const other = item.otherText ? `（我的是：${item.otherText}）` : "";
      return `${label}：${item.text}${other}`;
    })
    .join("\n");
  const user = `【服务器版本】\n${serverBlocks.map((b) => b.text).join("\n")}\n\n【我的版本】\n${myBlocks
    .map((b) => b.text)
    .join("\n")}\n\n【差异】\n${describe}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export type JudgeVerdict = { sameSpot: boolean; reason: string; merged?: string };

/** 解析模型回的 JSON（容忍 ```json 包裹） */
export function parseJudge(text: string): JudgeVerdict | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    return {
      sameSpot: !!obj.sameSpot,
      reason: typeof obj.reason === "string" ? obj.reason : "",
      merged: typeof obj.merged === "string" ? obj.merged : undefined,
    };
  } catch {
    return null;
  }
}

/* ---------------- 拉服务器当前版本 ---------------- */

export async function fetchServerRow(
  entity: string,
  entityId: string
): Promise<{ seq: number; payload: unknown } | null> {
  const server = await loadClipServerUrl();
  const token = await loadClipToken();
  try {
    const res = await fetch(
      `${server}/api/sync/row?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; seq?: number; payload?: unknown };
    if (!data.ok) return null;
    return { seq: data.seq ?? 0, payload: data.payload ?? null };
  } catch {
    return null;
  }
}

export type AiResolveOutcome = {
  ok: boolean;
  /** 是否已经自动合并 */
  merged: boolean;
  reason: string;
  diff?: DiffBlock[];
  error?: string;
};

/**
 * 对一个冲突副本做「AI 判定 + 必要时自动合并」。
 * 没配 AI / 判定失败 → 只返回差异，不动任何数据（安全第一）。
 */
export async function judgeAndMaybeMerge(input: {
  entity: string;
  entityId: string;
  myPayload: unknown;
  serverSeq: number;
}): Promise<AiResolveOutcome> {
  const row = await fetchServerRow(input.entity, input.entityId);
  if (!row) {
    return { ok: false, merged: false, reason: "", error: "读不到服务器当前版本（服务没连上？）" };
  }

  const serverBlocks = payloadBlocks(row.payload);
  const myBlocks = payloadBlocks(input.myPayload);
  if (!serverBlocks || !myBlocks) {
    return {
      ok: false,
      merged: false,
      reason: "这类数据（表结构）不做自动合并，保留副本请你手动处理",
    };
  }

  const diff = diffBlocks(serverBlocks, myBlocks);

  // 硬判定优先：同一段被两边各改过一次（块 id 相同、文字不同），
  // 就属于"同一位置"——这时合并只会丢掉一边，所以**一律不自动合并**，保留副本。
  // （AI 在这里的作用是处理"段落被整体重写、块 id 都变了"这种按 id 看不出来的情况。）
  if (hasSameSpotChange(diff)) {
    return {
      ok: true,
      merged: false,
      reason: "同一段被两边各改过一次，按块判定属于同一处，不自动合并，副本已保留",
      diff,
    };
  }

  const config = await loadAiConfig();
  if (!config) {
    return { ok: false, merged: false, reason: "还没配置 AI，只能看差异", diff };
  }

  const result = await chat(buildJudgeMessages(serverBlocks, myBlocks, diff), config);
  if (!result.ok) return { ok: false, merged: false, reason: "", diff, error: result.error };

  const verdict = parseJudge(result.text);
  if (!verdict) {
    return { ok: false, merged: false, reason: "模型没给出可解析的判定", diff };
  }
  if (verdict.sameSpot) {
    return { ok: true, merged: false, reason: verdict.reason || "两处改的是同一处，保留副本", diff };
  }

  // 不是同一处 → 合并（服务器的编辑 + 我的新增），用服务器当前版本号当基准推上去
  const mergedPayload = mergePayloadBlocks(row.payload, input.myPayload);
  if (!mergedPayload) {
    return { ok: false, merged: false, reason: verdict.reason, diff, error: "两边的结构对不上，合并不了" };
  }
  const push = await pushDirectChange({
    entity: input.entity as SyncEntity,
    entityId: input.entityId,
    payload: mergedPayload,
    baseSeq: row.seq,
  });
  if (!push.ok || push.status !== "applied") {
    return { ok: false, merged: false, reason: verdict.reason, diff, error: push.error ?? "合并后推送失败" };
  }
  return { ok: true, merged: true, reason: verdict.reason || "改动不在同一处，已合并进云端", diff };
}
