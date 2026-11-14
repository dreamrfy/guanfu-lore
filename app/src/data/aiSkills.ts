/**
 * 自定义 AI 技能（Skill）
 *
 * 一个 Skill = 一段固定的系统提示词 + 作用对象（整页 / 选中文字）。
 * 不引入脚本执行：第一批的 Skill 就是"可复用的提示词"，用户可以自己增删改。
 * 这样既满足"能自己挂 Skill"，又不会让一段从网上抄来的脚本直接跑在本机数据上。
 */
import type { ChatMessage } from "./ai";
import { repo } from "./db";
import { newId } from "./db";

export type SkillScope = "page" | "selection";

export type AiSkill = {
  id: string;
  name: string;
  /** 系统提示词：定义角色与输出格式 */
  system: string;
  scope: SkillScope;
  createdAt: number;
};

const SKILLS_KEY = "aiSkills";

export const SKILL_PRESETS: Array<Omit<AiSkill, "id" | "createdAt">> = [
  {
    name: "翻译成英文",
    scope: "selection",
    system:
      "你是专业中英翻译。只输出英文译文，保留原文的段落结构、专有名词与数字；不要解释，不要加引号。",
  },
  {
    name: "会议纪要",
    scope: "page",
    system:
      "你是会议纪要助手。用中文输出：1) 三行以内的结论；2) 待办清单（每条以「- [ ] 」开头，带负责人/时间，若原文没有就写「待确认」）；3) 未决问题。不要编造原文没有的信息。",
  },
  {
    name: "批判性审阅",
    scope: "page",
    system:
      "你是严格的审稿人。指出论证里最薄弱的 3 个点，每条给出：问题、为什么是问题、如何补强。不要泛泛而谈，不要总结全文。",
  },
];

export async function listSkills(): Promise<AiSkill[]> {
  const raw = await repo.getMeta<AiSkill[]>(SKILLS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is AiSkill => !!s && typeof s === "object" && typeof s.id === "string")
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function putSkills(items: AiSkill[]): Promise<void> {
  await repo.setMeta(SKILLS_KEY, items);
}

export function makeSkill(partial: Partial<AiSkill> = {}): AiSkill {
  return {
    id: newId(),
    name: partial.name?.trim() || "新技能",
    system: partial.system?.trim() || "",
    scope: partial.scope ?? "page",
    createdAt: Date.now(),
  };
}

/** 新增或按 id 更新 */
export async function saveSkill(skill: AiSkill): Promise<void> {
  const rest = (await listSkills()).filter((s) => s.id !== skill.id);
  await putSkills([...rest, { ...skill, name: skill.name.trim() || "未命名技能" }]);
}

export async function deleteSkill(id: string): Promise<void> {
  await putSkills((await listSkills()).filter((s) => s.id !== id));
}

/** 一键加入内置模板（同名已存在则跳过） */
export async function addPresetSkills(): Promise<number> {
  const existing = await listSkills();
  const names = new Set(existing.map((s) => s.name));
  const added = SKILL_PRESETS.filter((p) => !names.has(p.name)).map((p) => makeSkill(p));
  if (added.length > 0) await putSkills([...existing, ...added]);
  return added.length;
}

/**
 * 构造一次 Skill 调用的消息。
 * 输入为空返回 null（不要拿空内容去烧 token）。
 */
export function buildSkillMessages(
  skill: AiSkill,
  input: { title?: string; pageText?: string; selection?: string }
): ChatMessage[] | null {
  if (!skill.system.trim()) return null;
  if (skill.scope === "selection") {
    const text = (input.selection ?? "").trim();
    if (!text) return null;
    return [
      { role: "system", content: skill.system },
      { role: "user", content: text.slice(0, 8000) },
    ];
  }
  const text = (input.pageText ?? "").trim();
  if (!text) return null;
  return [
    { role: "system", content: skill.system },
    {
      role: "user",
      content: `标题：${input.title || "无标题"}\n\n正文：\n${text.slice(0, 12000)}`,
    },
  ];
}
