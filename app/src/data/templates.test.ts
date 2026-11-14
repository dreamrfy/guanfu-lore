import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import type { PageRow } from "./db";
import { createPageFromTemplate, deleteTemplate, listTemplates, savePageAsTemplate } from "./templates";

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
