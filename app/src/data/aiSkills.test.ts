import { beforeEach, describe, expect, it } from "vitest";
import { repo } from "./db";
import {
  addPresetSkills,
  buildSkillMessages,
  deleteSkill,
  listSkills,
  makeSkill,
  saveSkill,
  SKILL_PRESETS,
} from "./aiSkills";

beforeEach(async () => {
  await repo.setMeta("aiSkills", []);
});

describe("AI 技能：存取", () => {
  it("新建技能有默认值，保存后能读回", async () => {
    const skill = makeSkill({ name: "翻译", system: "译成英文", scope: "selection" });
    expect(skill.id).toBeTruthy();
    expect(skill.scope).toBe("selection");
    await saveSkill(skill);
    const list = await listSkills();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("翻译");
  });

  it("同 id 保存是更新，不是新增", async () => {
    const skill = makeSkill({ name: "旧名", system: "x" });
    await saveSkill(skill);
    await saveSkill({ ...skill, name: "新名" });
    const list = await listSkills();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("新名");
  });

  it("删除只删指定的那个", async () => {
    const a = makeSkill({ name: "A", system: "x" });
    const b = makeSkill({ name: "B", system: "y" });
    await saveSkill(a);
    await saveSkill(b);
    await deleteSkill(a.id);
    expect((await listSkills()).map((s) => s.name)).toEqual(["B"]);
  });

  it("内置模板只加一次", async () => {
    const first = await addPresetSkills();
    expect(first).toBe(SKILL_PRESETS.length);
    const second = await addPresetSkills();
    expect(second).toBe(0);
    expect(await listSkills()).toHaveLength(SKILL_PRESETS.length);
  });
});

describe("AI 技能：提示词", () => {
  it("整页技能带标题与正文", () => {
    const skill = makeSkill({ name: "纪要", system: "写纪要", scope: "page" });
    const messages = buildSkillMessages(skill, { title: "周会", pageText: "讨论了排期" });
    expect(messages?.[1].content).toContain("周会");
    expect(messages?.[1].content).toContain("讨论了排期");
  });

  it("选中文字技能只发选中部分", () => {
    const skill = makeSkill({ name: "翻译", system: "译", scope: "selection" });
    const messages = buildSkillMessages(skill, { pageText: "整页", selection: "这一段" });
    expect(messages?.[1].content).toBe("这一段");
  });

  it("没有输入 / 没有提示词时不发请求", () => {
    const blankInput = makeSkill({ name: "x", system: "y", scope: "selection" });
    expect(buildSkillMessages(blankInput, { selection: "  " })).toBeNull();
    const blankSystem = makeSkill({ name: "x", system: "", scope: "page" });
    expect(buildSkillMessages(blankSystem, { pageText: "正文" })).toBeNull();
  });
});
