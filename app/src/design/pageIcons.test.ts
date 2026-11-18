import { describe, expect, it } from "vitest";
import { EMOJI_CATEGORIES, pageIconValue, parsePageIcon } from "./pageIcons";

describe("页面图标解析（W42）", () => {
  it("8 个 emoji 分类，每类非空", () => {
    expect(EMOJI_CATEGORIES).toHaveLength(8);
    expect(EMOJI_CATEGORIES.every((c) => c.emojis.length > 0)).toBe(true);
  });

  it("普通 emoji 解析为 emoji，@icon: 前缀解析为图标库名", () => {
    expect(parsePageIcon("📄")).toEqual({ kind: "emoji", value: "📄" });
    expect(parsePageIcon(pageIconValue.fromIcon("star"))).toEqual({ kind: "icon", value: "star" });
    expect(parsePageIcon(null)).toEqual({ kind: "none" });
    expect(parsePageIcon("")).toEqual({ kind: "none" });
  });

  it("fromIcon 往返不丢信息", () => {
    const raw = pageIconValue.fromIcon("bolt");
    const p = parsePageIcon(raw);
    expect(p.kind === "icon" && p.value).toBe("bolt");
  });
});
