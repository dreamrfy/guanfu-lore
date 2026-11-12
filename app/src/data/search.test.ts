import { beforeEach, describe, expect, it } from "vitest";
import { extractBlocksText, searchAll } from "./search";
import { makePageRow, repo } from "./db";
import { useStore } from "./store";

const s = () => useStore.getState();

/** 造一个像样的块：段落里带行内文本 */
const para = (id: string, text: string) => ({
  id,
  type: "paragraph",
  props: {},
  content: [{ type: "text", text, styles: {} }],
  children: [],
});

beforeEach(() => {
  useStore.setState({ ready: false, bootError: null, pages: [], trash: [], docs: {}, tabs: [], activeTabId: null });
});

describe("正文抽文本", () => {
  it("按块抽出来，嵌套子块也算", () => {
    const blocks = [
      para("b1", "第一块"),
      { ...para("b2", "父块"), children: [para("b3", "子块")] },
    ];
    expect(extractBlocksText(blocks)).toEqual([
      { blockId: "b1", text: "第一块" },
      { blockId: "b2", text: "父块" },
      { blockId: "b3", text: "子块" },
    ]);
  });

  it("空块不产生条目", () => {
    expect(extractBlocksText([para("e1", "   ")])).toEqual([]);
  });

  it("链接里的文字也抽得到", () => {
    const blocks = [
      {
        id: "l1",
        type: "paragraph",
        props: {},
        content: [
          { type: "text", text: "看这个 ", styles: {} },
          { type: "link", href: "https://x.com", content: [{ type: "text", text: "磷化工资料", styles: {} }] },
        ],
        children: [],
      },
    ];
    expect(extractBlocksText(blocks)[0].text).toBe("看这个 磷化工资料");
  });
});

describe("全文搜索", () => {
  const setup = async () => {
    const a = makePageRow(null, "磷化工笔记");
    const b = makePageRow(null, "别的题目");
    await repo.putPages([a, b]);
    await repo.putDoc(a.id, [para("A1", "正文里提到磷酸铁锂的工艺")]);
    await repo.putDoc(b.id, [para("B1", "这段完全无关")]);
    useStore.setState({ pages: [a, b], docs: { [a.id]: [para("A1", "正文里提到磷酸铁锂的工艺")] } });
    return { a, b };
  };

  it("标题命中排在最前面，并给出高亮位置", async () => {
    await setup();
    const r = await searchAll("磷化工");
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe("磷化工笔记");
    expect(r[0].hits[0].blockId).toBe(""); // 空块 id = 标题命中
    expect(r[0].hits[0].snippet.slice(r[0].hits[0].start, r[0].hits[0].end)).toBe("磷化工");
  });

  it("正文命中给出所在块 id 与上下文片段", async () => {
    const { a } = await setup();
    const r = await searchAll("磷酸铁锂");
    expect(r).toHaveLength(1);
    expect(r[0].pageId).toBe(a.id);
    const hit = r[0].hits.find((h) => h.blockId === "A1");
    expect(hit).toBeTruthy();
    expect(hit!.snippet.slice(hit!.start, hit!.end)).toBe("磷酸铁锂");
    expect(hit!.snippet).toContain("工艺"); // 前后文带出来了
  });

  it("没打开的页面会从库里读（不依赖内存缓存）", async () => {
    await setup();
    useStore.setState({ docs: {} }); // 清掉内存里的正文
    const r = await searchAll("磷酸铁锂");
    expect(r).toHaveLength(1); // 依然搜得到，说明回库读了
  });

  it("大小写不敏感", async () => {
    const p = makePageRow(null, "BlockNote 测试");
    await repo.putPage(p);
    useStore.setState({ pages: [p], docs: { [p.id]: [] } });
    expect(await searchAll("blocknote")).toHaveLength(1);
  });

  it("没有命中就返回空，别返回一堆无关的", async () => {
    await setup();
    expect(await searchAll("完全不可能出现的词")).toEqual([]);
  });

  it("空查询直接返回空（不发无谓的扫描）", async () => {
    await setup();
    expect(await searchAll("   ")).toEqual([]);
  });
});
