// 剪藏记录的 R2 文件存储（路线 A，2026-11-05 拍板）
//
// 背景：用户 CloudBase 环境 biji-gcsb 是 PG 模式（无文档型数据库，实测菜单仅 PostgreSQL），
// 且 PG 实例跟随环境生命周期无法单独关闭。拍板：记录不落 CloudBase 数据库，
// 直接以 JSON 文件存 R2（与图片/快照同一存储），云函数只依赖微信凭证 + R2 凭证。
//
// 键布局（桶内）：
//   clips/{clipId}.json   单条剪藏记录（Clip 全量 JSON）
//   state/poll.json       轮询游标 + 续拉 token（云函数无持久文件系统）
//
// 并发口径（阶段一）：唯一写入方是云函数定时轮询（每 30 分钟一次，串行），
// 本地 CLI 用的 localStore（SQLite），互不相交。因此不设列表索引文件——
// 清单索引（V2.1 ④）：clips/index.json——服务端每次轮询后全量重建（ListObjectsV2 已实现），App 端只读。
import { getObject, listObjectKeys, putObject, type R2Config } from "./r2Store.ts";
import type { Clip } from "./types.ts";

export interface PollStateJson {
  cursor: string;
  token: string;
  updatedAt: string;
}

export class R2ClipStore {
  private readonly cfg: R2Config;
  constructor(cfg: R2Config) {
    this.cfg = cfg;
  }

  private clipKey(id: string): string {
    // clipId 形如 wx_/url_/invalid_ + 16 位十六进制，全部是 URL 安全字符
    return "clips/" + id + ".json";
  }

  /** 幂等覆盖写：PUT 同名键（clipId immutable，无需先删） */
  async saveClip(clip: Clip): Promise<void> {
    await putObject(this.cfg, this.clipKey(clip.id), Buffer.from(JSON.stringify(clip, null, 2), "utf8"), {
      contentType: "application/json",
    });
  }

  /** 存在性判定：不解析内容（记录文件损坏时仍返回 true，阻止重复入库；删掉该对象即可重新剪藏） */
  async existsClip(id: string): Promise<boolean> {
    const buf = await getObject(this.cfg, this.clipKey(id));
    return buf !== null;
  }

  /** 读取单条记录；不存在或 JSON 损坏返回 null（损坏仅在此显式读取时暴露） */
  async getClip(id: string): Promise<Clip | null> {
    const buf = await getObject(this.cfg, this.clipKey(id));
    if (buf === null) return null;
    try {
      return JSON.parse(buf.toString("utf8")) as Clip;
    } catch {
      return null;
    }
  }

  async loadPollState(): Promise<PollStateJson | null> {
    const buf = await getObject(this.cfg, "state/poll.json");
    if (buf === null) return null;
    try {
      const raw = JSON.parse(buf.toString("utf8")) as Partial<PollStateJson>;
      return { cursor: String(raw.cursor ?? ""), token: String(raw.token ?? ""), updatedAt: String(raw.updatedAt ?? "") };
    } catch {
      return null;
    }
  }

  async savePollState(s: PollStateJson): Promise<void> {
    await putObject(this.cfg, "state/poll.json", Buffer.from(JSON.stringify(s, null, 2), "utf8"), {
      contentType: "application/json",
    });
  }

  // —— 清单索引（V2.1 ④：App 端拉取入口）——

  /** 全量重建清单索引：列举 clips/ → 逐条读取 → 构建条目 → PUT clips/index.json。返回条数。 */
  async writeClipIndex(): Promise<number> {
    const keys = await listObjectKeys(this.cfg, { prefix: "clips/" });
    const clipKeys = keys.filter(
      (k) => /^clips\/[^/]+\.json$/.test(k) && k !== CLIP_INDEX_KEY
    );
    const clips: Clip[] = [];
    for (const k of clipKeys) {
      const buf = await getObject(this.cfg, k);
      if (buf === null) continue;
      try {
        clips.push(JSON.parse(buf.toString("utf8")) as Clip);
      } catch {
        // 损坏记录跳过，不阻塞索引重建
      }
    }
    const entries = buildClipIndexEntries(clips);
    await putObject(
      this.cfg,
      CLIP_INDEX_KEY,
      Buffer.from(JSON.stringify(entries, null, 2), "utf8"),
      { contentType: "application/json" }
    );
    return entries.length;
  }

  /** 读取清单索引（缺失或损坏 → null，App 端按「无可拉取」处理） */
  async getClipIndex(): Promise<ClipIndexEntry[] | null> {
    const buf = await getObject(this.cfg, CLIP_INDEX_KEY);
    if (buf === null) return null;
    try {
      const arr = JSON.parse(buf.toString("utf8")) as ClipIndexEntry[];
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }
}

// —— 索引条目构建（纯函数，导出便于测试）——

export interface ClipIndexEntry {
  id: string;
  title: string;
  source: string;
  savedAt: string;
  status: string;
}

export const CLIP_INDEX_KEY = "clips/index.json";
export const CLIP_INDEX_CAP = 500;

/** 纯函数：Clip 列表 → 索引条目（剔除不可解析项、按入库时间倒序、封顶 CLIP_INDEX_CAP） */
export function buildClipIndexEntries(clips: Clip[]): ClipIndexEntry[] {
  const entries: ClipIndexEntry[] = [];
  for (const c of clips) {
    if (c === null || typeof c !== "object") continue;
    if (typeof c.id !== "string" || c.id.length === 0) continue;
    entries.push({
      id: c.id,
      title: typeof c.title === "string" ? c.title : "",
      source: typeof c.source === "string" ? c.source : "unknown",
      savedAt: typeof c.savedAt === "string" ? c.savedAt : "",
      status: typeof c.status === "string" ? c.status : "unknown",
    });
  }
  entries.sort((a, b) => (a.savedAt > b.savedAt ? -1 : a.savedAt < b.savedAt ? 1 : 0));
  return entries.slice(0, CLIP_INDEX_CAP);
}
