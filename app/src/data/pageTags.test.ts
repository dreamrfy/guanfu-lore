import { describe, expect, it } from "vitest";
import { collectTags, normalizeTag, pagesWithTag } from "./pageTags";
import type { PageRow } from "./db";

const pg = (id: string, tags?: string[], opts?: Partial<PageRow>): PageRow => ({
  id,
  parentId: null,
  title: `页 ${id}`,
  icon: "📝",
  coverAssetId: null,
  createdAt: 1,
  updatedAt: Number(id.slice(1)) || 1,
  deletedAt: null,
  sortKey: 1,
  tags,
  ...opts,
});

describe("页面标签（M02）", () => {
  it("normalizeTag：去首尾空白、内部空白折叠；全空白 → 空串", () => {
    expect(normalizeTag("  工作  ")).toBe("工作");
    expect(normalizeTag("a  b	c")).toBe("a b c");
    expect(normalizeTag("   ")).toBe("");
  });

  it("collectTags：计数、次数降序、同次数中文序、软删页不计、无标签页跳过", () => {
    const pages = [
      pg("p1", ["工作", "项目"]),
      pg("p2", ["工作"]),
      pg("p3", ["生活", "工作"]),
      pg("p4", undefined),
      pg("p5", ["回收站里的"], { deletedAt: 999 }),
      pg("p6", ["生活"]),
    ];
    expect(collectTags(pages)).toEqual([
      { tag: "工作", count: 3 },
      { tag: "生活", count: 2 },
      { tag: "项目", count: 1 },
    ]);
  });

  it("collectTags：空输入 → 空数组", () => {
    expect(collectTags([])).toEqual([]);
  });

  it("pagesWithTag：只留活页里打了该标签的，按修改时间新→旧", () => {
    const pages = [
      pg("p1", ["工作"], { updatedAt: 10 }),
      pg("p2", ["工作"], { updatedAt: 30 }),
      pg("p3", ["生活"], { updatedAt: 99 }),
      pg("p4", ["工作"], { updatedAt: 50, deletedAt: 100 }),
    ];
    expect(pagesWithTag(pages, "工作").map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(pagesWithTag(pages, "不存在")).toEqual([]);
  });
});
