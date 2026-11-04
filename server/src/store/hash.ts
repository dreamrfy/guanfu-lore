// 稳定摘要工具（SHA-256）
//
// 用途：
// - 剪藏幂等主键（clipId）：同一篇文章不同跟踪参数 → 同一个 id
// - 资源编号（assetId）：同一图片地址 → 同一个编号
//
// 说明：旧实现用 FNV-1a（32 位状态），碰撞概率远高于 64 位；
// 这里统一改用 node:crypto 的 SHA-256，按需截取十六进制前缀。
// 这不是加密用途，但长度足够，不会因碰撞覆盖别人的记录。
import { createHash } from "node:crypto";

/** 返回 SHA-256 的十六进制摘要（小写） */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** 取摘要前 n 个十六进制字符（默认 16 = 64 位熵） */
export function shortHash(input: string, length = 16): string {
  return sha256Hex(input).slice(0, Math.max(4, Math.min(64, length)));
}
