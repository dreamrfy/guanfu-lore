/**
 * 剪藏失败离线队列（27 号 §3.1：失败 → "链接已保存"，联网后自动重试）
 *
 * 存储：localStorage（设备本地语义；队列不需要跨设备同步）。
 * 行为：
 *   - 抓取失败 → URL 入队（同一 URL 只留一条）
 *   - App 启动 / 任一次剪藏成功后 → 逐条重试，成功出队，失败 tries+1
 *   - 单条尝试超过 5 次自动出队（链接可能是死链，无限重试只会堆积）
 */
const QUEUE_KEY = "guanfu.clip.retryQueue";
const MAX_TRIES = 5;

export type ClipQueueItem = { url: string; savedAt: number; tries: number };

function load(): ClipQueueItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as ClipQueueItem[];
    return Array.isArray(raw)
      ? raw.filter((it) => typeof it?.url === "string").map((it) => ({ url: it.url, savedAt: it.savedAt ?? 0, tries: it.tries ?? 0 }))
      : [];
  } catch {
    return [];
  }
}

function save(items: ClipQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function clipQueueSize(): number {
  return load().length;
}

export function clipQueueList(): ClipQueueItem[] {
  return [...load()];
}

export function clipQueueHas(url: string): boolean {
  return load().some((it) => it.url === url);
}

/** 失败入队（幂等：同 URL 已在队就不重复，只更新时间） */
export function clipQueueAdd(url: string): number {
  const items = load().filter((it) => it.url !== url);
  items.unshift({ url, savedAt: Date.now(), tries: 0 });
  save(items);
  return items.length;
}

export function clipQueueRemove(url: string): number {
  const items = load().filter((it) => it.url !== url);
  save(items);
  return items.length;
}

/** 测试/调试用 */
export function clipQueueClearForTest(): void {
  save([]);
}

/** 队列变化广播（入口徽章监听） */
export function notifyQueueChanged(): void {
  try {
    window.dispatchEvent(new Event("gf:clip-queue-changed"));
  } catch {
    /* ignore */
  }
}

/**
 * 逐条重试。processor 由调用方注入（requestClip+ingestClip），便于测试。
 * 遇到第一个失败就停（服务大概率还没恢复），失败的条目 tries+1；
 * tries 超过上限的条目直接出队——死链不该永远占着队列。
 * 返回 { attempted, succeeded, remaining }。
 */
export async function clipQueueProcess(
  processor: (url: string) => Promise<void>,
): Promise<{ attempted: number; succeeded: number; remaining: number; lastError?: string }> {
  const items = load();
  let attempted = 0;
  let succeeded = 0;
  let lastError: string | undefined;
  for (const it of items) {
    attempted++;
    try {
      await processor(it.url);
      succeeded++;
      save(load().filter((x) => x.url !== it.url));
    } catch (e) {
      lastError = String((e as Error).message ?? e);
      const rest = load().map((x) => (x.url === it.url ? { ...x, tries: x.tries + 1 } : x)).filter((x) => x.tries < MAX_TRIES);
      save(rest);
      break; // 一条失败就停，等下次触发
    }
  }
  return { attempted, succeeded, remaining: clipQueueSize(), lastError };
}