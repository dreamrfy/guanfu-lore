import { describe, expect, it } from "vitest";
import { db, makePageRow, repo } from "./db";

describe("仓储层", () => {
  it("新建的页面行字段完整", () => {
    const row = makePageRow(null, "测试页");
    expect(row.id).toBeTruthy();
    expect(row.title).toBe("测试页");
    expect(row.parentId).toBeNull();
    expect(row.deletedAt).toBeNull();
    expect(row.sortKey).toBeGreaterThan(0);
  });

  it("写入后能按顺序列出来", async () => {
    const a = makePageRow(null, "第一篇");
    const b = { ...makePageRow(null, "第二篇"), sortKey: a.sortKey + 1000 };
    await repo.putPages([b, a]); // 故意乱序写入
    const list = await repo.listPages();
    expect(list.map((p) => p.title)).toEqual(["第一篇", "第二篇"]);
  });

  it("软删进回收站、恢复回来、彻底删除清干净", async () => {
    const row = makePageRow(null, "要删的");
    await repo.putPage(row);
    await repo.putDoc(row.id, [{ type: "paragraph" }]);

    await repo.softDeletePage(row.id);
    expect(await repo.listPages()).toHaveLength(0);
    expect((await repo.listPages(true)).map((p) => p.id)).toContain(row.id);

    await repo.restorePage(row.id);
    expect((await repo.listPages()).map((p) => p.id)).toContain(row.id);

    await repo.purgePage(row.id);
    expect(await repo.listPages(true)).toHaveLength(0);
    expect(await repo.getDoc(row.id)).toBeNull(); // 正文也要跟着清掉
  });

  it("正文按页面分开存取", async () => {
    const p1 = makePageRow(null, "A");
    const p2 = makePageRow(null, "B");
    await repo.putPages([p1, p2]);
    await repo.putDoc(p1.id, [{ type: "paragraph" }, { type: "paragraph" }]);
    await repo.putDoc(p2.id, [{ type: "heading" }]);

    expect(await repo.getDoc(p1.id)).toHaveLength(2);
    expect(await repo.getDoc(p2.id)).toHaveLength(1);
    expect(await repo.getDoc("不存在的id")).toBeNull();
  });

  it("整库导出/导入是一个可往返的过程", async () => {
    const p = makePageRow(null, "往返测试");
    await repo.putPage(p);
    await repo.putDoc(p.id, [{ type: "paragraph", content: [{ type: "text", text: "内容" }] }]);
    await repo.setMeta("主题", "dark");

    const snapshot = await repo.exportAll();
    expect(snapshot.pages).toHaveLength(1);
    expect(snapshot.docs).toHaveLength(1);

    // 清空后导回来，内容应完全一致
    await db.pages.clear();
    await db.docs.clear();
    await repo.importAll({ pages: snapshot.pages, docs: snapshot.docs, meta: snapshot.meta });

    const again = await repo.exportAll();
    expect(again.pages).toEqual(snapshot.pages);
    expect(again.docs).toEqual(snapshot.docs);
    expect(await repo.getMeta("主题")).toBe("dark");
  });

  it("导入会整体覆盖，而不是合并", async () => {
    await repo.putPage(makePageRow(null, "旧数据A"));
    await repo.putPage(makePageRow(null, "旧数据B"));

    const only = makePageRow(null, "只应有这一篇");
    await repo.importAll({ pages: [only], docs: [], meta: [] });

    const list = await repo.listPages();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("只应有这一篇");
  });

  it("旧版 localStorage 数据能一次性搬进数据库，且搬完删旧键", async () => {
    const legacy = {
      pages: [
        {
          id: "legacy-1",
          title: "旧版笔记",
          icon: "📄",
          parentId: null,
          blocks: [{ type: "paragraph", content: [{ type: "text", text: "旧内容", styles: {} }] }],
          createdAt: 111,
          updatedAt: 222,
        },
      ],
    };
    localStorage.setItem("bijiapp.v3.store", JSON.stringify(legacy));

    const { migrateLegacyLocalStorage } = await import("./db");
    const moved = await migrateLegacyLocalStorage();

    expect(moved).toBe(1);
    expect(localStorage.getItem("bijiapp.v3.store")).toBeNull();
    const list = await repo.listPages();
    expect(list.map((p) => p.title)).toEqual(["旧版笔记"]);
    expect(await repo.getDoc("legacy-1")).toHaveLength(1);
  });
});
