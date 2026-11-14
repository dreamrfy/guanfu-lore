/**
 * 页面模板
 *
 * 模板就是"一份正文 + 标题 + 图标"的快照，存在 meta 表里（备份时会一起带走）。
 * 不做"模板变量/占位符"这类花活：第一批只要能把常用结构一键开出来。
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

/** 用模板新建一页并切过去。返回新页面 id */
export async function createPageFromTemplate(template: PageTemplate): Promise<string> {
  const state = useStore.getState();
  // 正文必须跟着 createPage 一起进去：编辑器是"挂载时读一次 initialBlocks"，
  // 先开页再 setBlocks 的话，界面上会是空的（库里其实有）。
  const pageId = await state.createPage(null, template.blocks as PartialBlock[]);
  state.renamePage(pageId, template.name);
  if (template.icon) state.setPageIcon(pageId, template.icon);
  return pageId;
}
