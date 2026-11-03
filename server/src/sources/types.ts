// 来源解析接口（G4：剪藏入口可替换——现在接微信客服，将来可换其他入口而不改上层）
import type { NormalizedItem } from "../store/types.ts";

/**
 * 一个“剪藏来源”的适配器：把该来源的一条原始记录归一化为标准条目。
 * 返回 null 表示该记录不属于本来源（或无法识别）。
 */
export interface SourceAdapter {
  id: string;
  parse(message: Record<string, unknown>): NormalizedItem | null;
}
