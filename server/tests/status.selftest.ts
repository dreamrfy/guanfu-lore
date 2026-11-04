// 状态机自测（P0-02）：空正文绝不 complete、缺图只能 partial、正常才 complete
// 用法: node tests/status.selftest.ts
import { deriveStatus, FAIL_REASON_LABELS } from "../src/pipeline/status.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const cases: Array<[string, Parameters<typeof deriveStatus>[0], string, string | null]> = [
  ["空正文 → failed/content_missing", { textLength: 0, imagesTotal: 0, imagesFailed: 0 }, "failed", "content_missing"],
  ["空白正文（trim 后 0）→ failed", { textLength: 0, imagesTotal: 3, imagesFailed: 0 }, "failed", "content_missing"],
  ["负数长度 → failed", { textLength: -1, imagesTotal: 0, imagesFailed: 0 }, "failed", "content_missing"],
  ["NaN 长度 → failed", { textLength: Number.NaN, imagesTotal: 0, imagesFailed: 0 }, "failed", "content_missing"],
  ["正文 + 缺图 → partial/images_failed", { textLength: 120, imagesTotal: 3, imagesFailed: 1 }, "partial", "images_failed"],
  ["正文 + 全部图片失败 → partial", { textLength: 120, imagesTotal: 3, imagesFailed: 3 }, "partial", "images_failed"],
  ["正文 + 图片全成功 → complete", { textLength: 120, imagesTotal: 3, imagesFailed: 0 }, "complete", null],
  ["正文 + 无图 → complete", { textLength: 120, imagesTotal: 0, imagesFailed: 0 }, "complete", null],
  ["元数据型来源 → partial/content_missing", { textLength: 40, imagesTotal: 0, imagesFailed: 0, metadataOnly: true }, "partial", "content_missing"],
  ["资源落盘失败 → partial/internal_error", { textLength: 120, imagesTotal: 1, imagesFailed: 0, assetWriteFailures: 1 }, "partial", "internal_error"],
  ["致命错误 → failed，并保留原因", { textLength: 0, imagesTotal: 0, imagesFailed: 0, fatal: "blocked_by_platform" }, "failed", "blocked_by_platform"],
];

for (const [name, input, status, reason] of cases) {
  const got = deriveStatus(input);
  check(name, got.status === status && got.failReason === reason, JSON.stringify(got));
}

// 红线：任何输入组合下，正文为空都不得 complete
for (const imagesTotal of [0, 1, 5]) {
  for (const imagesFailed of [0, 1, 5]) {
    for (const metadataOnly of [false, true]) {
      const r = deriveStatus({ textLength: 0, imagesTotal, imagesFailed, metadataOnly });
      check(`空正文 + 图 ${imagesTotal}/${imagesFailed} + metadata=${metadataOnly} 不得 complete`, r.status !== "complete");
    }
  }
}

// 失败原因必须有中文说明（清单页/报告口径统一）
const reasons = Object.keys(FAIL_REASON_LABELS);
check("失败原因均有中文说明", reasons.every((k) => FAIL_REASON_LABELS[k as keyof typeof FAIL_REASON_LABELS].length > 0));

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
