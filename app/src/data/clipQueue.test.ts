import { beforeEach, describe, expect, it } from "vitest";
import {
  clipQueueAdd,
  clipQueueClearForTest,
  clipQueueHas,
  clipQueueList,
  clipQueueProcess,
  clipQueueRemove,
  clipQueueSize,
} from "./clipQueue";

beforeEach(() => {
  localStorage.clear();
  clipQueueClearForTest();
});

describe("剪藏失败离线队列", () => {
  it("入队/查重/出队", () => {
    expect(clipQueueSize()).toBe(0);
    clipQueueAdd("https://mp.weixin.qq.com/s/a");
    clipQueueAdd("https://mp.weixin.qq.com/s/a"); // 同 URL 幂等
    expect(clipQueueSize()).toBe(1);
    expect(clipQueueHas("https://mp.weixin.qq.com/s/a")).toBe(true);
    clipQueueRemove("https://mp.weixin.qq.com/s/a");
    expect(clipQueueSize()).toBe(0);
  });

  it("重试：成功的出队、失败的 tries+1 并停住", async () => {
    clipQueueAdd("https://x.test/ok");
    clipQueueAdd("https://x.test/bad");
    const calls: string[] = [];
    const r = await clipQueueProcess(async (url) => {
      calls.push(url);
      if (url.includes("bad")) throw new Error("服务不可达");
    });
    // 队列顺序是最新的在前（unshift），bad 先被处理就停
    expect(calls.length).toBe(1);
    expect(r.succeeded).toBe(0);
    expect(r.remaining).toBe(2);
    expect(clipQueueList().find((it) => it.url.includes("bad"))?.tries).toBe(1);
  });

  it("重试：全部成功即清空", async () => {
    clipQueueAdd("https://x.test/1");
    clipQueueAdd("https://x.test/2");
    const r = await clipQueueProcess(async () => {});
    expect(r.succeeded).toBe(2);
    expect(r.remaining).toBe(0);
    expect(clipQueueSize()).toBe(0);
  });

  it("失败超过 5 次自动出队（死链不堆积）", async () => {
    clipQueueAdd("https://x.test/dead");
    for (let i = 0; i < 5; i++) {
      await clipQueueProcess(async () => {
        throw new Error("still down");
      });
    }
    expect(clipQueueSize()).toBe(0); // 第 5 次失败后出队
  });
});