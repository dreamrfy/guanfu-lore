import { beforeEach, describe, expect, it } from "vitest";
import { flushDocs, useStore } from "./store";
import { useNavHistory } from "./navHistory";

/** 每个用例开始前把内存状态清干净（库由 setup.ts 负责清） */
function resetAll() {
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
  useNavHistory.setState({ stack: [], idx: -1, tick: 0 });
}

const s = () => useStore.getState();
const n = () => useNavHistory.getState();

beforeEach(resetAll);

describe("导航历史（W12 后退/前进/主页）", () => {
  it("启动页入栈：hydrate 后只有一条历史，后退/前进都不可用", async () => {
    await s().hydrate();
    expect(n().stack).toEqual([s().activeTabId]);
    expect(n().idx).toBe(0);
    expect(n().canBack()).toBe(false);
    expect(n().canForward()).toBe(false);
  });

  it("新建页面压栈 → 后退回启动页 → 前进回新页", async () => {
    await s().hydrate();
    const firstId = s().activeTabId as string;
    const secondId = await s().createPage(null);
    expect(n().idx).toBe(1);
    expect(n().canBack()).toBe(true);

    n().back();
    expect(s().activeTabId).toBe(firstId);
    expect(n().canBack()).toBe(false);
    expect(n().canForward()).toBe(true);

    n().forward();
    expect(s().activeTabId).toBe(secondId);
    expect(n().canForward()).toBe(false);
  });

  it("从历史中间新建页面会截断前进分支（同浏览器）", async () => {
    await s().hydrate();
    await s().createPage(null); // B
    n().back(); // 回 A
    await s().createPage(null); // C：截断前进
    expect(n().stack).toHaveLength(2);
    expect(n().canForward()).toBe(false);
  });

  it("关闭页签后剪掉栈里的死条目，后退不会翻到已关页", async () => {
    await s().hydrate();
    const firstId = s().activeTabId as string;
    const secondId = await s().createPage(null);
    s().closeTab(secondId);
    expect(n().stack).toEqual([firstId]);
    expect(n().idx).toBe(0);
    expect(n().canForward()).toBe(false);
    n().back(); // 无路可退：栈只剩启动页
    expect(n().idx).toBe(0);
  });

  it("goHome 打开最近修改的页面（主页【暂定】语义）", async () => {
    await s().hydrate();
    const firstId = s().activeTabId as string;
    const secondId = await s().createPage(null);
    // 把旧页的时间戳人为提到最新（模拟"刚改过旧页"）
    useStore.setState((st) => ({
      pages: st.pages.map((p) => (p.id === firstId ? { ...p, updatedAt: Date.now() + 60_000 } : p)),
    }));
    // 切到新页，让"当前页 ≠ 最近修改页"
    s().setActiveTab(secondId);
    expect(s().activeTabId).toBe(secondId);

    n().goHome();
    expect(s().activeTabId).toBe(firstId);
  });

  it("refresh 强制重读正文并 bump tick（编辑器重挂载链路）", async () => {
    await s().hydrate();
    const id = s().activeTabId as string;
    const tick0 = n().tick;
    await s().setBlocks(id, [{ type: "paragraph", content: "刷新前" }]);
    await flushDocs(); // 防抖落库后再读
    // 直接改库，绕过内存镜像，模拟"外部变更"
    const raw = (await (await import("./db")).repo.getDoc(id)) ?? [];
    (raw[0] as { content: string }).content = "刷新后";
    await (await import("./db")).repo.putDoc(id, raw);

    await n().refresh();
    expect(n().tick).toBe(tick0 + 1);
    const doc = s().docs[id] as Array<{ content: unknown }>;
    expect(JSON.stringify(doc)).toContain("刷新后");
  });
});
