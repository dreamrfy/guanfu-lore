/**
 * 整库备份与恢复
 *
 * 对应需求：M7-06 整库导出/备份、M10-05 自动备份、M10-06 从备份恢复。
 * 现在做成"手动导出一个 JSON 文件 + 能导回来"——这是最实用的第一步：
 *  数据在自己的硬盘上有一份可带走的副本，软件坏了/清缓存了都不怕。
 * 自动定时备份（写到本地文件 / 上传 R2）在接上服务端与桌面壳之后再做。
 */
import { repo } from "./db";
import { flushDocs, readPrefs, savePrefs } from "./store";

export const BACKUP_KIND = "ge-ren-zhi-shi-ku.backup";

type BackupPayload = {
  kind: string;
  version: number;
  exportedAt: number;
  prefs: unknown;
  pages: unknown[];
  docs: unknown[];
  meta: unknown[];
};

/** 组装备份载荷（手动导出与自动定时备份共用） */
export async function buildBackupPayload(): Promise<{ payload: BackupPayload; pages: number; docs: number }> {
  await flushDocs(); // 先把防抖里没落盘的正文写掉，避免"备份少了最后几秒的改动"
  const data = await repo.exportAll();
  const payload: BackupPayload = {
    kind: BACKUP_KIND,
    version: 1,
    exportedAt: Date.now(),
    prefs: readPrefs(),
    pages: data.pages,
    docs: data.docs,
    meta: data.meta,
  };
  return { payload, pages: data.pages.length, docs: data.docs.length };
}

/** 导出成文件（浏览器/桌面都会弹出保存对话框） */
export async function exportBackup(): Promise<{ pages: number; docs: number }> {
  const { payload, pages, docs } = await buildBackupPayload();

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `知识库备份-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { pages, docs };
}

/** 从文件恢复：**会覆盖当前全部数据**，调用方必须先跟用户确认 */
export async function importBackupFile(file: File): Promise<{ pages: number }> {
  const text = await file.text();
  let parsed: BackupPayload;
  try {
    parsed = JSON.parse(text) as BackupPayload;
  } catch {
    throw new Error("这个文件不是合法的 JSON，可能选错了文件。");
  }
  return restoreFromPayload(parsed);
}

/** 从载荷恢复（自动备份快照的「恢复此份」共用；**会覆盖当前全部数据**） */
export async function restoreFromPayload(parsed: unknown): Promise<{ pages: number }> {
  const p = parsed as BackupPayload;
  if (p?.kind !== BACKUP_KIND || !Array.isArray(p.pages)) {
    throw new Error("这不是本应用导出的备份文件。");
  }
  if (p.version !== 1) {
    throw new Error(`备份文件版本是 ${p.version}，当前程序只认识版本 1。`);
  }

  await repo.importAll({
    pages: p.pages as never,
    docs: (p.docs ?? []) as never,
    meta: (p.meta ?? []) as never,
  });
  if (p.prefs) savePrefs(p.prefs as never);
  return { pages: p.pages.length };
}
