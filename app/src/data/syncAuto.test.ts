import { describe, expect, it } from "vitest";
import { AUTO_SYNC_BACKOFF_MS, AUTO_SYNC_INTERVAL_MS, shouldAutoSync } from "./syncAuto";

describe("自动同步的调度", () => {
  it("有本地改动时立刻同步", () => {
    expect(shouldAutoSync({ pending: 2, lastSyncAt: Date.now(), now: Date.now() })).toBe(true);
  });

  it("从没同步过时先来一次", () => {
    expect(shouldAutoSync({ pending: 0, lastSyncAt: null, now: 1000 })).toBe(true);
  });

  it("刚同步过就不到点", () => {
    const now = 10_000_000;
    expect(shouldAutoSync({ pending: 0, lastSyncAt: now - 1000, now })).toBe(false);
  });

  it("超过间隔就同步", () => {
    const now = 10_000_000;
    expect(
      shouldAutoSync({ pending: 0, lastSyncAt: now - AUTO_SYNC_INTERVAL_MS - 1, now })
    ).toBe(true);
  });

  it("刚失败过会退避，不打爆服务器", () => {
    const now = 10_000_000;
    expect(
      shouldAutoSync({
        pending: 0,
        lastSyncAt: null,
        lastErrorAt: now - 1000,
        now,
      })
    ).toBe(false);
    expect(
      shouldAutoSync({
        pending: 0,
        lastSyncAt: null,
        lastErrorAt: now - AUTO_SYNC_BACKOFF_MS - 1,
        now,
      })
    ).toBe(true);
  });
});
