/**
 * 问答提示词与出处（纯函数，方便单测）
 */
import type { ChatMessage } from "./ai";
import type { Chunk } from "./ragIndex";

export type Citation = {
  /** 出处编号（对应答案里的 [1][2]） */
  index: number;
  title: string;
  heading: string;
  text: string;
  entity: string;
  entityId: string;
  blockId: string;
};

/**
 * 严格 / 宽松两种回答口径（决策 D7）：
 *  - 严格：资料里没有就说"没找到"，绝不编；
 *  - 宽松：资料不足时允许补充，但必须标注"（资料外推测）"。
 */
export function buildAskMessages(
  question: string,
  chunks: Chunk[],
  strict: boolean
): ChatMessage[] {
  const system = strict
    ? "你是个人知识库的问答助手。只依据【资料】回答，并用 [1][2] 标出处。资料里找不到就明确说「知识库里没有相关内容」，不要编造。"
    : "你是个人知识库的问答助手。优先依据【资料】回答并标 [1][2] 出处；资料不足时可以补充，但必须标注「（资料外推测）」。";
  const materials = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] 《${chunk.title}》${chunk.heading ? ` · ${chunk.heading}` : ""}\n${chunk.text}`
    )
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: `【资料】\n${materials}\n\n【问题】\n${question}` },
  ];
}

export function buildCitations(chunks: Chunk[]): Citation[] {
  return chunks.map((chunk, index) => ({
    index: index + 1,
    title: chunk.title,
    heading: chunk.heading,
    text: chunk.text,
    entity: chunk.entity,
    entityId: chunk.entityId,
    blockId: chunk.blockId,
  }));
}
