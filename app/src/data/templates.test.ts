import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import type { PageRow } from "./db";
import { createPageFromTemplate, deleteTemplate, formatPlaceholderTime, listTemplates, savePageAsTemplate } from "./templates";

const page = (id: string, title: string): PageRow => ({
  id,
  parentId: null,
  title,
  icon: "📝",
  coverAssetId: null,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  sortKey: 1,
});

beforeEach(() => {
  useStore.setState({ pages: [], docs: {}, tabs: [], activeTabId: null, collections: [], records: {} });
});

describe("页面模板", () => {
  it("存模板 → 列表 → 用模板建页 → 删除", async () => {
    const blocks = [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "本周进展" }] }];
    useStore.setState({ pages: [page("p1", "周报模板")], docs: { p1: blocks } });

    const tpl = await savePageAsTemplate("p1");
    expect(tpl).not.toBeNull();
    expect(tpl!.name).toBe("周报模板");
    expect(tpl!.icon).toBe("📝");
    expect(await listTemplates()).toHaveLength(1);

    const newPageId = await createPageFromTemplate(tpl!);
    const state = useStore.getState();
    expect(state.pages.find((p) => p.id === newPageId)?.title).toBe("周报模板");
    expect(state.pages.find((p) => p.id === newPageId)?.icon).toBe("📝");
    expect(state.docs[newPageId]).toEqual(blocks);

    await deleteTemplate(tpl!.id);
    expect(await listTemplates()).toHaveLength(0);
  });

  it("模板正文是深拷贝：之后改原页面不会改到模板", async () => {
    const blocks = [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "原文" }] }];
    useStore.setState({ pages: [page("p1", "模板")], docs: { p1: blocks } });
    const tpl = await savePageAsTemplate("p1");

    // 模拟用户回头改了原页面
    (blocks[0] as { content: { text: string }[] }).content[0].text = "改过了";

    expect(await listTemplates()).toHaveLength(1);
    const saved = (await listTemplates())[0];
    expect(JSON.stringify(saved.blocks)).toContain("原文");
    expect(JSON.stringify(saved.blocks)).not.toContain("改过了");
    expect(tpl!.name).toBe("模板");
  });

  it("页面不存在时返回 null，不会写坏模板列表", async () => {
    expect(await savePageAsTemplate("missing")).toBeNull();
    expect(await listTemplates()).toHaveLength(0);
  });
});

describe("模板占位符（M01）", () => {
  const isoPage = (id: string, title: string): PageRow => ({
    id, parentId: null, title, icon: "📝", coverAssetId: null,
    createdAt: 1, updatedAt: 1, deletedAt: null, sortKey: 1,
  });

  it("formatPlaceholderTime：本地时区补零格式", () => {
    expect(formatPlaceholderTime(new Date(2026, 10, 5, 8, 7))).toEqual({ date: "2026-11-05", time: "08:07" });
    expect(formatPlaceholderTime(new Date(2026, 11, 31, 23, 59))).toEqual({ date: "2026-12-31", time: "23:59" });
  });

  it("插入时填充 {{日期}}/{{时间}}/{{标题}}，多处生效；模板原件不被改动", async () => {
    const blocks = [
      {
        id: "b1",
        type: "heading",
        content: [{ type: "text", text: "{{标题}} · {{日期}}" }],
      },
      {
        id: "b2",
        type: "paragraph",
        content: [
          { type: "text", text: "早上 {{时间}} 起床" },
          { type: "text", text: "{{日期}} 又 {{日期}}，{{标题}}回顾" },
        ],
      },
      { id: "b3", type: "paragraph", content: [{ type: "text", text: "无占位符照原样" }] },
    ];
    useStore.setState({ pages: [isoPage("p1", "日记 {{日期}}")], docs: { p1: blocks } });
    const tpl = await savePageAsTemplate("p1");

    const newPageId = await createPageFromTemplate(tpl!);
    const state = useStore.getState();

    // 新页标题：模板名里的 {{日期}} 填掉；{{标题}} 在名字里留原样（自引用无意义）
    const newPage = state.pages.find((p) => p.id === newPageId)!;
    expect(newPage.title).toMatch(/^日记 \d{4}-\d{2}-\d{2}$/);

    // 正文：{{标题}} = 填好的标题；{{日期}}/{{时间}} 已填，无残留
    const doc = JSON.stringify(state.docs[newPageId]);
    expect(doc).not.toContain("{{标题}}");
    expect(doc).not.toContain("{{日期}}");
    expect(doc).not.toContain("{{时间}}");
    expect(state.docs[newPageId][0]).toMatchObject({
      content: [{ text: expect.stringContaining(newPage.title) }],
    });
    expect(state.docs[newPageId][1]).toMatchObject({
      content: [
        { text: expect.stringMatching(/^早上 \d{2}:\d{2} 起床$/) },
        { text: expect.stringMatching(/^[\d-]+ 又 [\d-]+，/s) },
      ],
    });
    // 无占位符的块原样
    expect(state.docs[newPageId][2]).toEqual(blocks[2]);

    // 模板原件仍是占位符原样，下次插入还会再填
    const saved = (await listTemplates())[0];
    expect(JSON.stringify(saved.blocks)).toContain("{{日期}}");
    expect(saved.name).toBe("日记 {{日期}}");
  });

  it("占位符替换不破坏块结构（id/类型原样），嵌套对象里的字符串也填", async () => {
    const blocks = [
      {
        id: "b1",
        type: "paragraph",
        props: { level: 2 },
        content: [{ type: "link", href: "https://x.com/?d={{日期}}", content: [{ type: "text", text: "{{标题}}" }] }],
      },
    ];
    useStore.setState({ pages: [isoPage("p1", "周报")], docs: { p1: blocks } });
    const tpl = await savePageAsTemplate("p1");
    const newPageId = await createPageFromTemplate(tpl!);
    const b = useStore.getState().docs[newPageId][0] as typeof blocks[0];
    expect(b.id).toBe("b1");
    expect(b.type).toBe("paragraph");
    expect(b.props).toEqual({ level: 2 });
    expect(b.content[0].href).toMatch(/^https:\/\/x\.com\/\?d=\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(b.content)).toContain("周报");
  });
});
