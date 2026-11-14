import { beforeEach, describe, expect, it } from "vitest";
import { repo } from "./db";
import {
  applyRemoteToDb,
  buildPushPayload,
  coalesceOutbox,
  enqueueChange,
  parseRemoteChange,
} from "./sync";

beforeEach(async () => {
  await repo.clearOutbox();
  await repo.purgePage("p-test").catch(() => {});
});

describe("同步：本地队列合并", () => {
  it("同一行的多次改动只留最新一条", () => {
    const existing = [
      { id: 1, entity: "page", entityId: "p1", op: "upsert" as const, payload: { v: 1 }, baseSeq: 0, actor: "a", createdAt: 1 },
    ];
    const merged = coalesceOutbox(existing, {
      entity: "page",
      entityId: "p1",
      op: "upsert",
      payload: { v: 2 },
      baseSeq: 0,
      actor: "a",
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.payload).toEqual({ v: 2 });
  });

  it("不同行互不影响", () => {
    const merged = coalesceOutbox([], {
      entity: "page",
      entityId: "p2",
      op: "upsert",
      payload: {},
      baseSeq: 0,
      actor: "a",
    });
    expect(merged).toHaveLength(1);
  });
});

describe("同步：推给服务器的载荷", () => {
  it("字段一一对应", () => {
    const payload = buildPushPayload([
      { id: 1, entity: "page", entityId: "p1", op: "upsert", payload: { a: 1 }, baseSeq: 3, actor: "dev", createdAt: 1 },
    ]);
    expect(payload[0]).toEqual({
      entity: "page",
      entityId: "p1",
      op: "upsert",
      payload: { a: 1 },
      baseSeq: 3,
      actor: "dev",
    });
  });
});

describe("同步：解析远端变更", () => {
  it("认识的实体 + 合法 JSON 才收", () => {
    const ok = parseRemoteChange({
      seq: 1,
      entity: "page",
      entityId: "p1",
      op: "upsert",
      payload: JSON.stringify({ page: { id: "p1" } }),
      actor: "dev",
      baseSeq: 0,
      createdAt: 1,
    });
    expect(ok?.entity).toBe("page");

    const badEntity = parseRemoteChange({
      seq: 1,
      entity: "whatever",
      entityId: "x",
      op: "upsert",
      payload: "{}",
      actor: "",
      baseSeq: 0,
      createdAt: 1,
    });
    expect(badEntity).toBeNull();

    const badJson = parseRemoteChange({
      seq: 1,
      entity: "page",
      entityId: "x",
      op: "upsert",
      payload: "{坏",
      actor: "",
      baseSeq: 0,
      createdAt: 1,
    });
    expect(badJson).toBeNull();
  });
});

describe("同步：写本地库", () => {
  it("远端页面会落到本地 pages 表（正文一起）", async () => {
    const page = {
      id: "p-test",
      parentId: null,
      title: "远端来的",
      icon: null,
      coverAssetId: null,
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
      sortKey: 0,
    };
    await applyRemoteToDb({
      entity: "page",
      entityId: "p-test",
      op: "upsert",
      payload: { page, blocks: [{ id: "b1", type: "paragraph", content: [] }] },
    });
    const pages = await repo.listPages();
    const found = pages.find((p) => p.id === "p-test");
    expect(found?.title).toBe("远端来的");
    const doc = await repo.getDoc("p-test");
    expect(doc).toHaveLength(1);
  });
});

describe("同步：入队", () => {
  it("同一行连续改动，队列里只剩一条最新的", async () => {
    await enqueueChange({ entity: "page", entityId: "p-q", op: "upsert", payload: { v: 1 } });
    await enqueueChange({ entity: "page", entityId: "p-q", op: "upsert", payload: { v: 2 } });
    const rows = await repo.listOutbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toEqual({ v: 2 });
  });
});
