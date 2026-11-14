/**
 * 自动同步的调度规则（纯函数，方便单测）
 *
 * 为什么要自动同步：桌面端、浏览器端、手机端可能同时开着；
 * 手动点「立即同步」不现实。但也不能太频繁——每次都打服务器没意义。
 */

/** 常规间隔：1 分钟 */
export const AUTO_SYNC_INTERVAL_MS = 60_000;

/** 轮询间隔：15 秒（决定"到点了没"） */
export const AUTO_SYNC_TICK_MS = 15_000;

export type AutoSyncState = {
  /** 本地待推送的条数 */
  pending: number;
  /** 上次同步成功的时刻（毫秒；null = 从没同步过） */
  lastSyncAt: number | null;
  /** 上次同步失败的时刻（用于退避：连不上时别每 15 秒重试一次） */
  lastErrorAt?: number | null;
  now: number;
  intervalMs?: number;
};

/** 失败后的退避时间 */
export const AUTO_SYNC_BACKOFF_MS = 60_000;

export function shouldAutoSync(state: AutoSyncState): boolean {
  const interval = state.intervalMs ?? AUTO_SYNC_INTERVAL_MS;
  // 刚失败过：先退避，别把服务器打爆
  if (state.lastErrorAt && state.now - state.lastErrorAt < AUTO_SYNC_BACKOFF_MS) return false;
  // 有本地改动：尽快推上去（断网时会在下次再试）
  if (state.pending > 0) return true;
  // 从没同步过：先来一次，把云端的内容拉下来
  if (state.lastSyncAt === null) return true;
  return state.now - state.lastSyncAt >= interval;
}
