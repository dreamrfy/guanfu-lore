import { describe, expect, it } from "vitest";
import { STRINGS } from "./strings";
import type { StringKey } from "./strings";

/**
 * 文案字典完整性（《品牌与文案-观复Lore》是唯一来源，这里守结构）：
 * 每个键中英成对、非空；新键忘写某一种语言时编译与测试都会拦。
 */
describe("i18n 字典", () => {
  const keys = Object.keys(STRINGS) as StringKey[];

  it("字典不为空", () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  it("每个键 zh/en 成对且非空字符串", () => {
    for (const key of keys) {
      expect(typeof STRINGS[key].zh, `${key}.zh`).toBe("string");
      expect(typeof STRINGS[key].en, `${key}.en`).toBe("string");
      expect(STRINGS[key].zh.trim().length, `${key}.zh`).toBeGreaterThan(0);
      expect(STRINGS[key].en.trim().length, `${key}.en`).toBeGreaterThan(0);
    }
  });

  it("中英同键不出现直译占位（同一值复用是改稿遗漏的信号）", () => {
    // 仅提示性检查：品牌键（AI/MCP 等专有名词）允许相同
    const allowSame = new Set(["aiTabActions", "aiTabChat", "aiTabAsk", "aiTabSkills"]);
    for (const key of keys) {
      if (!allowSame.has(key) && STRINGS[key].zh === STRINGS[key].en) {
        expect.unreachable(`${key} 中英同值，若确属专有名词请加进 allowSame`);
      }
    }
  });
});
