import { describe, expect, it } from "vitest";
import { countClipStatuses, clipRecordStatus, filterClipRecords } from "./clipInbox";
import { makeCollection, makeField } from "./collections";
import type { CollectionRow, FieldDef, RecordRow } from "./db";

function clipCollection(): CollectionRow {
  const base = makeCollection("剪藏库");
  const title = base.fields.find((f) => f.type === "text") ?? makeField("text", "标题");
  const status: FieldDef = {
    ...makeField("select", "状态"),
    id: "f-status",
    options: [
      { id: "s-unread", name: "未读", color: "blue" },
      { id: "s-read", name: "已读", color: "grey" },
      { id: "s-failed", name: "失败", color: "red" },
    ],
  };
  return {
    ...base,
    fields: [
      { ...title, id: "f-title", name: "标题" },
      { ...makeField("text", "作者"), id: "f-author" },
      { ...makeField("url", "原文链接"), id: "f-url" },
      status,
    ],
  };
}

function rec(values: Record<string, unknown>, id: string): RecordRow {
  return { id, collectionId: "c1", values, createdAt: 1, updatedAt: 1 };
}

const collection = clipCollection();
const records = [
  rec({ "f-title": "微信文章一", "f-author": "老猪", "f-url": "https://mp.weixin.qq.com/a", "f-status": "未读" }, "r1"),
  rec({ "f-title": "B站视频二", "f-author": "某某", "f-url": "https://bilibili.com/b", "f-status": "已读" }, "r2"),
  rec({ "f-title": "抓取失败三", "f-author": "作者", "f-url": "https://x.test/c", "f-status": "失败" }, "r3"),
];

describe("收集箱状态归类", () => {
  it("未读/空 → 待整理；已读 → 已归档；失败 → 失败", () => {
    expect(clipRecordStatus(collection, records[0])).toBe("pending");
    expect(clipRecordStatus(collection, records[1])).toBe("archived");
    expect(clipRecordStatus(collection, records[2])).toBe("failed");
    expect(clipRecordStatus(collection, rec({ "f-title": "空状态" }, "r4"))).toBe("pending");
  });

  it("计数包含全部/待整理/已归档/失败", () => {
    expect(countClipStatuses(collection, records)).toEqual({
      all: 3,
      pending: 1,
      archived: 1,
      failed: 1,
    });
  });
});

describe("收集箱筛选与搜索", () => {
  it("按状态筛选", () => {
    expect(filterClipRecords(collection, records, "pending", "").map((r) => r.id)).toEqual(["r1"]);
    expect(filterClipRecords(collection, records, "archived", "").map((r) => r.id)).toEqual(["r2"]);
    expect(filterClipRecords(collection, records, "failed", "").map((r) => r.id)).toEqual(["r3"]);
    expect(filterClipRecords(collection, records, "all", "")).toHaveLength(3);
  });

  it("搜索标题、作者、链接，忽略大小写与首尾空格", () => {
    expect(filterClipRecords(collection, records, "all", "  老猪 ").map((r) => r.id)).toEqual(["r1"]);
    expect(filterClipRecords(collection, records, "all", "bilibili").map((r) => r.id)).toEqual(["r2"]);
    expect(filterClipRecords(collection, records, "all", "微信").map((r) => r.id)).toEqual(["r1"]);
    expect(filterClipRecords(collection, records, "all", "不存在")).toEqual([]);
  });

  it("状态筛选与搜索可以叠加", () => {
    expect(filterClipRecords(collection, records, "pending", "bilibili")).toEqual([]);
    expect(filterClipRecords(collection, records, "pending", "微信").map((r) => r.id)).toEqual(["r1"]);
  });
});