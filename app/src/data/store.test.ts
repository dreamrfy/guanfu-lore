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

describe("AI 命令通道", () => {
  it("斜杠命令写进 store，面板关着也会顺手打开右侧面板", () => {
    useStore.setState({ rightPanelOpen: false, aiCommand: null });
    s().dispatchAiCommand({ kind: "summary" });
    expect(s().aiCommand).toEqual({ kind: "summary" });
    expect(s().rightPanelOpen).toBe(true);
    s().clearAiCommand();
    expect(s().aiCommand).toBeNull();
  });
});

describe("多维表格：记录详情", () => {
  it("打开记录会顺手展开右侧面板，正文防抖落库，删表后自动收起", async () => {
    await s().hydrate();
    const collectionId = await s().createCollection("剪藏库");
    await s().addRecord(collectionId);
    const rec = s().records[collectionId][0];
    expect(rec).toBeTruthy();

    useStore.setState({ rightPanelOpen: false });
    s().openRecord(collectionId, rec.id);
    expect(s().openRecordRef).toEqual({ collectionId, recordId: rec.id });
    expect(s().rightPanelOpen).toBe(true);

    const blocks = [{ type: "paragraph", content: "正文第一段" }];
    s().setRecordDoc(collectionId, rec.id, blocks);
    expect(s().records[collectionId][0].doc).toEqual(blocks); // 内存立刻可读

    await sleep(400);
    const rows = await repo.listRecords(collectionId);
    expect(rows[0].doc).toEqual(blocks); // 防抖后确实落库了

    await s().deleteCollection(collectionId);
    expect(s().openRecordRef).toBeNull();
  });

  it("想法区（R01）：与正文 doc 分开落库，写想法不动正文", async () => {
    await s().hydrate();
    const collectionId = await s().createCollection("剪藏库");
    await s().addRecord(collectionId);
    const rec = s().records[collectionId][0];

    const doc = [{ type: "paragraph", content: "文章原文" }];
    s().setRecordDoc(collectionId, rec.id, doc);
    const thoughts = [{ type: "paragraph", content: "我的想法" }];
    s().setRecordThoughts(collectionId, rec.id, thoughts);

    expect(s().records[collectionId][0].thoughts).toEqual(thoughts); // 内存立刻可读
    expect(s().records[collectionId][0].doc).toEqual(doc); // 正文没被想法覆盖

    await sleep(400);
    const rows = await repo.listRecords(collectionId);
    expect(rows[0].thoughts).toEqual(thoughts); // 库里分字段存
    expect(rows[0].doc).toEqual(doc);
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

describe("setPageTags（M02）", () => {
  it("归一去重保序、写库、更新 updatedAt；重复打同一标签只留一次", async () => {
    await s().hydrate();
    const id = s().pages[0].id;
    const before = s().pages.find((p) => p.id === id)!.updatedAt;

    s().setPageTags(id, ["  工作 ", " 工作", "", "项目"]);

    const row = s().pages.find((p) => p.id === id)!;
    expect(row.tags).toEqual(["工作", "项目"]);
    expect(row.updatedAt).toBeGreaterThanOrEqual(before);

    await sleep(50);
    expect((await repo.listPages()).find((p) => p.id === id)?.tags).toEqual(["工作", "项目"]);

    // 整体覆盖语义：传空数组 = 清空
    s().setPageTags(id, []);
    expect(s().pages.find((p) => p.id === id)!.tags).toEqual([]);
  });
});
