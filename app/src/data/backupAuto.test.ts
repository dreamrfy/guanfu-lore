import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteBackupSnapshot,
  isBackupDue,
  listBackupSnapshots,
  loadBackupAutoPrefs,
  loadBackupLastAt,
  resetBackupDbForTest,
  restoreBackupSnapshot,
  runBackupSnapshot,
  saveBackupAutoPrefs,
} from "./backupAuto";
import { flushDocs, useStore } from "./store";

const s = () => useStore.getState();

beforeEach(async () => {
  localStorage.clear();
  await resetBackupDbForTest();
  useStore.setState({ ready: false, bootError: null, pages: [], trash: [], docs: {}, tabs: [], activeTabId: null });
  await s().hydrate(); // 空库会建第一篇
  await flushDocs();
});

describe("自动定时备份", () => {
  it("默认开启、间隔 6 小时；isBackupDue 首次为 true，备份后按间隔判 false", async () => {
    expect(loadBackupAutoPrefs()).toEqual({ on: true, intervalHours: 6 });
    expect(isBackupDue(Date.now())).toBe(true);
    await runBackupSnapshot();
    expect(isBackupDue(Date.now())).toBe(false);
    expect(loadBackupLastAt()).toBeGreaterThan(0);
    expect(isBackupDue(Date.now() + 7 * 60 * 60 * 1000)).toBe(true); // 超过 6h 又到点
  });

  it("关闭开关后不到点；保存偏好生效", () => {
    saveBackupAutoPrefs({ on: false, intervalHours: 1 });
    expect(loadBackupAutoPrefs().on).toBe(false);
    expect(isBackupDue(Date.now())).toBe(false);
    saveBackupAutoPrefs({ on: true, intervalHours: 1 });
    expect(loadBackupAutoPrefs().intervalHours).toBe(1);
    expect(isBackupDue(Date.now() + 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("快照可列出、可恢复（内容回来）、保留最近 5 份", async () => {
    const pageId = await s().createPage(null);
    s().renamePage(pageId, "备份恢复对照页");
    await flushDocs();
    await runBackupSnapshot();
    const list = await listBackupSnapshots();
    expect(list.length).toBe(1);
    expect(list[0].pages).toBeGreaterThan(0);

    // 恢复：先把对照页移进回收站，恢复后标题应回来
    // （restoreFromPayload 与 importBackupFile 一样只写库；界面靠整页 reload 对齐，测试里用 hydrate 模拟）
    await s().moveToTrash(pageId);
    expect(s().pages.some((p) => p.title === "备份恢复对照页")).toBe(false);
    const r = await restoreBackupSnapshot(list[0].id);
    expect(r.pages).toBeGreaterThan(0);
    await s().hydrate();
    expect(s().pages.some((p) => p.title === "备份恢复对照页")).toBe(true);
  });

  it("只保留最近 5 份，旧的自动清理", async () => {
    for (let i = 0; i < 7; i++) {
      await runBackupSnapshot();
      await new Promise((r) => setTimeout(r, 10)); // 保证时间戳 id 不重复
    }
    const list = await listBackupSnapshots();
    expect(list.length).toBe(5);
    expect(list[0].createdAt).toBeGreaterThan(list[4].createdAt); // 最近在前
    await deleteBackupSnapshot(list[0].id);
    expect((await listBackupSnapshots()).length).toBe(4);
  });
});