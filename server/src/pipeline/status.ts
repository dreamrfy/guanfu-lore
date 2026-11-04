// 状态判定（SNAP-02 红线）：纯函数，流水线与测试共用同一套规则
//
// 红线（不得违反）：
// 1) 正文为空 → 只能是 failed / partial，**绝不 complete**
// 2) 图片缺失或下载失败 → partial + images_failed
// 3) 元数据型来源（阶段一只能拿标题/描述）→ partial + content_missing
// 4) 只有正文完整、必要资源落盘且校验通过才写 complete
//
// 这样做的原因：旧实现把 `status: "complete"` 写死，空正文也会显示“完整快照”，
// 用户会把空记录误认为已完整保存（审计 P0-02 已实际复现）。
import type { ClipStatus, FailReason } from "../store/types.ts";

export interface StatusInput {
  /** 正文纯文本长度（trim 之后） */
  textLength: number;
  /** 正文里发现的图片总数 */
  imagesTotal: number;
  /** 下载/落盘失败的图片数 */
  imagesFailed: number;
  /** 元数据型来源（B站/小红书/抖音阶段一）：只有标题与描述 */
  metadataOnly?: boolean;
  /** 资源文件落盘失败数（写盘异常） */
  assetWriteFailures?: number;
  /** 抓取阶段已判定为失败的致命错误 */
  fatal?: FailReason | null;
}

export interface StatusResult {
  status: ClipStatus;
  failReason: FailReason | null;
}

export function deriveStatus(input: StatusInput): StatusResult {
  if (input.fatal) {
    return { status: "failed", failReason: input.fatal };
  }
  if (!Number.isFinite(input.textLength) || input.textLength <= 0) {
    return { status: "failed", failReason: "content_missing" };
  }
  if (input.metadataOnly) {
    return { status: "partial", failReason: "content_missing" };
  }
  if ((input.assetWriteFailures ?? 0) > 0) {
    return { status: "partial", failReason: "internal_error" };
  }
  if (input.imagesFailed > 0) {
    return { status: "partial", failReason: "images_failed" };
  }
  if (!Number.isFinite(input.imagesTotal) || input.imagesTotal < 0) {
    return { status: "partial", failReason: "internal_error" };
  }
  return { status: "complete", failReason: null };
}

/** 失败原因 → 给用户看的中文说明（报告/清单页共用，避免口径漂移） */
export const FAIL_REASON_LABELS: Record<FailReason, string> = {
  network_timeout: "网络超时（已按退避重试）",
  blocked_by_platform: "被平台风控拦截，需要重新获取",
  content_missing: "正文缺失或为空",
  images_failed: "部分图片下载失败",
  unsupported_type: "暂不支持的来源或类型",
  blocked_address: "目标地址被安全策略拒绝",
  response_too_large: "响应体超过大小上限",
  internal_error: "内部错误（数据库/解析）",
};
