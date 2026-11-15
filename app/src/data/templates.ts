/**
 * 页面模板
 *
 * 模板就是"一份正文 + 标题 + 图标"的快照，存在 meta 表里（备份时会一起带走）。
 * 占位符（M01）：{{日期}} {{时间}} {{标题}}，在模板插入新页那一刻填充。
 */
import type { PartialBlock } from "@blocknote/core";
import { newId, repo } from "./db";
import { useStore } from "./store";

export type PageTemplate = {
  id: string;
  name: string;
  icon: string | null;
  /** BlockNote 块数组的快照（存进库时做一次深拷贝，之后改原页面不影响模板） */
  blocks: unknown[];
  createdAt: number;
};

const TEMPLATES_KEY = "pageTemplates";

export async function listTemplates(): Promise<PageTemplate[]> {
  const raw = await repo.getMeta<PageTemplate[]>(TEMPLATES_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function putTemplates(items: PageTemplate[]): Promise<void> {
  await repo.setMeta(TEMPLATES_KEY, items);
}

/** 把某页当前内容存成模板（正文优先取内存里正在编辑的那份） */
export async function savePageAsTemplate(pageId: string): Promise<PageTemplate | null> {
  const state = useStore.getState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const blocks = state.docs[pageId] ?? (await repo.getDoc(pageId)) ?? [];
  const template: PageTemplate = {
    id: newId(),
    name: page.title || "未命名模板",
    icon: page.icon,
    blocks: JSON.parse(JSON.stringify(blocks)) as unknown[],
    createdAt: Date.now(),
  };
  const rest = await listTemplates();
  await putTemplates([template, ...rest]);
  return template;
}

export async function deleteTemplate(id: string): Promise<void> {
  const rest = await listTemplates();
  await putTemplates(rest.filter((t) => t.id !== id));
}

/** 占位符的取值（本地时区）。日期 YYYY-MM-DD、时间 HH:mm */
export type PlaceholderTime = { date: string; time: string };

export function formatPlaceholderTime(now: Date): PlaceholderTime {
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
    time: `${p(now.getHours())}:${p(now.getMinutes())}`,
  };
}

/** 只填日期/时间两类。标题单独处理：自己引用自己没有意义 */
function fillDateTime(text: string, t: PlaceholderTime): string {
  return text.replaceAll("{{日期}}", t.date).replaceAll("{{时间}}", t.time);
}

/** 正文用：日期/时间之外，{{标题}} → 新页标题（= 模板名填好日期后的结果） */
function fillBodyText(text: string, title: string, t: PlaceholderTime): string {
  return fillDateTime(text, t).replaceAll("{{标题}}", title);
}

/** 递归走 JSON 值替换字符串里的占位符；结构不动，返回全新一棵树（模板原件不受影响） */
function fillDeep(value: unknown, title: string, t: PlaceholderTime): unknown {
  if (typeof value === "string") return fillBodyText(value, title, t);
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, title, t));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = fillDeep(v, title, t);
    return out;
  }
  return value;
}

/** 用模板新建一页并切过去。返回新页面 id */
export async function createPageFromTemplate(template: PageTemplate): Promise<string> {
  const state = useStore.getState();
  const t = formatPlaceholderTime(new Date());
  // 标题只填日期/时间（{{标题}} 在名字里留原样）；正文里的 {{标题}} 用填好的标题
  const title = fillDateTime(template.name, t);
  const blocks = fillDeep(template.blocks, title, t) as PartialBlock[];
  // 正文必须跟着 createPage 一起进去：编辑器是"挂载时读一次 initialBlocks"，
  // 先开页再 setBlocks 的话，界面上会是空的（库里其实有）。
  const pageId = await state.createPage(null, blocks);
  state.renamePage(pageId, title);
  if (template.icon) state.setPageIcon(pageId, template.icon);
  return pageId;
}
