import { describe, expect, it } from "vitest";
import { dropLeadingTitleBlock, safeFileName, titleFromMarkdown } from "./exporters";
import type { PartialBlock } from "@blocknote/core";

const heading = (text: string, level = 1): PartialBlock =>
  ({ type: "heading", props: { level }, content: [{ type: "text", text, styles: {} }] }) as unknown as PartialBlock;

const para = (text: string): PartialBlock =>
  ({ type: "paragraph", props: {}, content: [{ type: "text", text, styles: {} }] }) as unknown as PartialBlock;

describe("导出辅助", () => {
  it("文件名里的非法字符会被换掉（否则下载会失败）", () => {
    expect(safeFileName('a/b:c*d?e"f<g>h|i', "md")).toBe("a_b_c_d_e_f_g_h_i.md");
  });

  it("空标题有兜底名", () => {
    expect(safeFileName("", "md")).toBe("无标题.md");
  });

  it("从 Markdown 里取第一个一级标题当页面名", () => {
    expect(titleFromMarkdown("# 磷化工笔记\n\n正文", "兜底")).toBe("磷化工笔记");
  });

  it("没有一级标题时用文件名兜底", () => {
    expect(titleFromMarkdown("没有标题的正文\n## 小标题", "我的文件")).toBe("我的文件");
  });
});

describe("导入时去掉重复的标题块", () => {
  it("第一块是与页面标题同名的一级标题 → 去掉它", () => {
    const blocks = [heading("磷化工笔记"), para("正文")];
    const out = dropLeadingTitleBlock("磷化工笔记", blocks);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(blocks[1]);
  });

  it("标题不同则不动", () => {
    const blocks = [heading("别的标题"), para("正文")];
    expect(dropLeadingTitleBlock("磷化工笔记", blocks)).toHaveLength(2);
  });

  it("第一块不是标题则不动", () => {
    const blocks = [para("磷化工笔记"), para("正文")];
    expect(dropLeadingTitleBlock("磷化工笔记", blocks)).toHaveLength(2);
  });

  it("是二级标题则不动（二级标题属于正文结构）", () => {
    const blocks = [heading("磷化工笔记", 2), para("正文")];
    expect(dropLeadingTitleBlock("磷化工笔记", blocks)).toHaveLength(2);
  });
});
