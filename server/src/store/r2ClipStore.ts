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
// 清单类需求在阶段二客户端出现时再议（S3 ListObjectsV2 需要带查询串签名，届时实现）。
import { getObject, putObject, type R2Config } from "./r2Store.ts";
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
}
