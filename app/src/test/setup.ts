/**
 * 测试环境准备
 *  - fake-indexeddb：在 Node 里跑真实的 IndexedDB 语义（不是打桩），
 *    这样仓储层、事务、索引、版本迁移都能被真正测到。
 *  - 每个用例前后清库，保证用例之间互不污染。
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { db } from "../data/db";

// jsdom 没有实现 blob 地址相关的接口，这里补上（测试里只需要它能生成/释放地址）
if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: () => `blob:test-${Math.random().toString(36).slice(2)}`,
  });
}
if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: () => {} });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  // 删库再开库：拿到一个干净的 v(最新) 结构
  await db.delete();
  await db.open();
});
