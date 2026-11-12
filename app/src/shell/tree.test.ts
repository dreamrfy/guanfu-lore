import { describe, expect, it } from "vitest";
import { buildTree } from "./Sidebar";
import type { PageRow } from "../data/db";

const row = (id: string, title: string, parentId: string | null = null): PageRow => ({
  id,
  parentId,
  title,
  icon: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  sortKey: 1,
});

describe("侧栏页面树", () => {
  it("按父子层级摊平并算好缩进", () => {
    const tree = buildTree([
      row("a", "父"),
      row("b", "子", "a"),
      row("c", "孙", "b"),
      row("d", "另一个顶层"),
    ]);
    expect(tree.map((n) => [n.title, n.depth])).toEqual([
      ["父", 0],
      ["子", 1],
      ["孙", 2],
      ["另一个顶层", 0],
    ]);
  });

  it("父级不存在（被删/在回收站）的子页要当顶层显示，不能消失", () => {
    const tree = buildTree([row("orphan", "孤儿页", "已经被删掉的父级")]);
    expect(tree.map((n) => n.title)).toEqual(["孤儿页"]);
    expect(tree[0].depth).toBe(0);
  });

  it("数据里成环时不能死循环（极端兜底）", () => {
    const tree = buildTree([row("x", "X", "y"), row("y", "Y", "x")]);
    // 两个都不出现在正常遍历里，但会被末尾的兜底补出来，至少看得见
    expect(tree.map((n) => n.title).sort()).toEqual(["X", "Y"]);
  });

  it("空列表返回空树", () => {
    expect(buildTree([])).toEqual([]);
  });
});
