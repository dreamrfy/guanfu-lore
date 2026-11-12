import { beforeEach, describe, expect, it } from "vitest";
import { flushDocs, useStore } from "./store";
import { repo } from "./db";

/** 每个用例开始前把内存状态清干净（库由 setup.ts 负责清） */
function resetStore() {
  useStore.setState({
    ready: false,
    bootError: null,
    pages: [],
    trash: [],
    docs: {},
    tabs: [],
    activeTabId: null,
    sidebarCollapsed: false,
  });
}

const s = () => useStore.getState();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(resetStore);

describe("应用状态", () => {
  it("空库首次启动会建一篇空页面（标题是空字符串，不是「无标题」）", async () => {
    await s().hydrate();
    expect(s().ready).toBe(true);
    expect(s().bootError).toBeNull();
    expect(s().pages).toHaveLength(1);
    expect(s().pages[0].title).toBe("");
    expect(s().activeTabId).toBe(s().pages[0].id);
  });

  it("新建页面：进列表、开标签、正文就绪", async () => {
    await s().hydrate();
    const id = await s().createPage(null);
    expect(s().pages).toHaveLength(2);
    expect(s().tabs).toContain(id);
    expect(s().activeTabId).toBe(id);
    expect(s().docs[id]).toEqual([]);
  });

  it("改名立刻反映到内存，并落库", async () => {
    await s().hydrate();
    const id = s().pages[0].id;
    s().renamePage(id, "磷化工笔记");
    expect(s().pages[0].title).toBe("磷化工笔记"); // 界面立刻变
    await sleep(50);
    const rows = await repo.listPages();
    expect(rows[0].title).toBe("磷化工笔记"); // 库里也变了
  });

  it("正文按需加载：打开别的页面才去读它的正文", async () => {
    await s().hydrate();
    const first = s().pages[0].id;
    await s().ensureDoc(first);
    expect(s().docs[first]).toEqual([]);

    const id = await s().createPage(null);
    expect(s().docs[id]).toEqual([]); // 新建页面已知为空
  });

  it("正文写入有防抖：不会每敲一键就写库，但最终一定落库", async () => {
    await s().hydrate();
    const id = s().pages[0].id;
    void s().ensureDoc(id);

    s().setBlocks(id, [{ type: "paragraph" }]);
    s().setBlocks(id, [{ type: "paragraph" }, { type: "paragraph" }]);

    // 防抖窗口内库里还是空的
    expect(await repo.getDoc(id)).toBeNull();

    await sleep(400);
    expect(await repo.getDoc(id)).toHaveLength(2);
  });

  it("flushDocs 能立刻把没落盘的正文写掉（关窗前用）", async () => {
    await s().hydrate();
    const id = s().pages[0].id;
    void s().ensureDoc(id);
    s().setBlocks(id, [{ type: "paragraph" }]);
    await flushDocs();
    expect(await repo.getDoc(id)).toHaveLength(1);
  });

  it("删掉最后一篇时会自动补一篇空页，避免界面没东西可开", async () => {
    await s().hydrate();
    const only = s().pages[0].id;
    await s().moveToTrash(only);

    expect(s().pages).toHaveLength(1);
    expect(s().pages[0].id).not.toBe(only);
    expect(s().trash.map((p) => p.id)).toContain(only);
    expect(s().activeTabId).toBe(s().pages[0].id);
  });

  it("回收站可以恢复，恢复后正文还在", async () => {
    await s().hydrate();
    const id = s().pages[0].id;
    void s().ensureDoc(id);
    s().setBlocks(id, [{ type: "paragraph" }, { type: "paragraph" }]);
    await flushDocs();
    s().renamePage(id, "要恢复的");

    await s().moveToTrash(id);
    await s().restoreFromTrash(id);

    expect(s().pages.map((p) => p.title)).toContain("要恢复的");
    expect(s().trash.map((p) => p.id)).not.toContain(id);
    expect(await repo.getDoc(id)).toHaveLength(2);
  });

  it("彻底删除会把正文一并清掉", async () => {
    await s().hydrate();
    const id = s().pages[0].id;
    void s().ensureDoc(id);
    s().setBlocks(id, [{ type: "paragraph" }]);
    await flushDocs();

    await s().moveToTrash(id);
    await s().purgeFromTrash(id);
    expect(await repo.getDoc(id)).toBeNull();
  });

  it("标签至少要留一个", async () => {
    await s().hydrate();
    const only = s().tabs[0];
    s().closeTab(only);
    expect(s().tabs).toHaveLength(1);
  });

  it("启动失败时不会永远转圈，而是给出原因", async () => {
    const spy = vi.spyOn(repo, "listPages").mockRejectedValueOnce(new Error("库打不开"));
    await s().hydrate();
    expect(s().ready).toBe(true); // 关键：ready 一定是 true，否则界面卡在加载页
    expect(s().bootError).toBe("库打不开");
    spy.mockRestore();
  });
});

describe("页面层级（拖拽移动）", () => {
  it("能把页面变成另一篇的子页，也能拖回顶层", async () => {
    await s().hydrate();
    const a = s().pages[0].id;
    const b = await s().createPage(null);

    expect(s().setParent(b, a)).toBe(true);
    expect(s().pages.find((p) => p.id === b)?.parentId).toBe(a);
    await sleep(50);
    expect((await repo.listPages()).find((p) => p.id === b)?.parentId).toBe(a);

    expect(s().setParent(b, null)).toBe(true);
    expect(s().pages.find((p) => p.id === b)?.parentId).toBeNull();
  });

  it("不允许把页面移到自己或自己的子孙底下（否则整棵子树会从侧栏消失）", async () => {
    await s().hydrate();
    const a = s().pages[0].id;
    const b = await s().createPage(a); // b 是 a 的子页
    const c = await s().createPage(b); // c 是 b 的子页

    expect(s().setParent(a, a)).toBe(false); // 自己
    expect(s().setParent(a, b)).toBe(false); // 自己的子页
    expect(s().setParent(a, c)).toBe(false); // 自己的孙页

    expect(s().pages.find((p) => p.id === a)?.parentId).toBeNull(); // 一个都没改成功
  });
});
