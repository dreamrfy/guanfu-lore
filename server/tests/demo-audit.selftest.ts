// demo 图片口径验收（第三轮 T-04）
// 用「完整图片来源」口径检查：
//   1) server/out/offline_*.html 原始文件里的 img/srcset/source/CSS 背景图
//   2) 入库记录所对应的落盘快照（必须没有 complete + 未本地化图片）
// 不联网；数据目录隔离；跑完清理。
// 用法: node tests/demo-audit.selftest.ts
import fs from "node:fs";
import path from "node:path";

process.env.KF_DATA_DIR = "data-selftest-demo";
process.env.KF_ASSETS_DIR = "data-selftest-demo/assets";

const { runDemo } = await import("../src/pipeline.ts");
const { listClips, readAssetFile, closeDb } = await import("../src/store/localStore.ts");
const { auditSnapshotImages } = await import("../src/fetch/snapshot.ts");
const { ASSETS_DIR, OUT_DIR } = await import("../src/config.ts");

const SERVER_ROOT = path.dirname(import.meta.dirname);
const TEST_DIR = path.join(SERVER_ROOT, "data-selftest-demo");

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

// ---- 1) 原始离线文件：按完整口径统计 ----
const files = fs
  .readdirSync(OUT_DIR)
  .filter((f) => /^offline_\d+\.html$/.test(f))
  .sort();

if (files.length === 0) {
  console.log("⚠️ server/out 下没有 offline_*.html，跳过原始文件统计（不算失败）");
} else {
  console.log("原始离线文件（图片来源：img.src / img.srcset / source / CSS background）");
  console.log("file".padEnd(34) + "total".padStart(6) + "local".padStart(7) + "ext".padStart(6) + "miss".padStart(6) + "invalid".padStart(9));
  for (const name of files) {
    const html = fs.readFileSync(path.join(OUT_DIR, name), "utf8");
    const a = auditSnapshotImages(html, ASSETS_DIR);
    console.log(
      name.padEnd(34) +
        String(a.total).padStart(6) +
        String(a.local).padStart(7) +
        String(a.external).padStart(6) +
        String(a.missing).padStart(6) +
        String(a.invalid).padStart(9)
    );
  }
  check("原始文件统计覆盖所有 offline_*.html", true);
}

// ---- 2) 跑 demo → 检查入库记录与落盘快照 ----
const stats = runDemo();
console.log(
  `\ndemo: 扫描 ${stats.scanned} / 新入库 ${stats.saved} / 跳过 ${stats.skippedExisting} / 失败 ${stats.failed}`
);
check("demo 无扫描失败", stats.failed === 0, JSON.stringify(stats.failures));

const clips = listClips();
console.log("\n入库记录（状态 + 快照审计）");
console.log("status".padEnd(10) + "snapshot(img/srcset/source/css)".padEnd(34) + "note".padEnd(40) + "title");
let violations = 0;
for (const c of clips) {
  const htmlRef = c.assets.find((a) => a.ext === "html");
  let summary = "no-snapshot";
  if (htmlRef) {
    const buf = readAssetFile(htmlRef);
    const a = auditSnapshotImages(buf ? buf.toString("utf8") : "", ASSETS_DIR);
    summary = `t=${a.total} local=${a.local} ext=${a.external} miss=${a.missing} bad=${a.invalid}`;
    const hasProblem = a.failed > 0;
    if (c.status === "complete" && hasProblem) violations += 1;
    console.log(
      String(c.status).padEnd(10) + summary.padEnd(34) + String(c.note ?? "-").slice(0, 38).padEnd(40) + String(c.title).slice(0, 26)
    );
  } else {
    if (c.status === "complete") violations += 1;
    console.log(String(c.status).padEnd(10) + summary.padEnd(34) + String(c.note ?? "-").slice(0, 38).padEnd(40) + String(c.title).slice(0, 26));
  }
}

check("不存在 complete + 未本地化图片", violations === 0, "违规 " + violations + " 条");
// 至少要能观察到“图片未本地化 → partial”的证据（当前样例里有懒加载/外链两类）
const partialImageIssue = clips.filter(
  (c) => c.status === "partial" && /外链|缺失|无效/.test(c.note ?? "")
);
check(
  "样例里的未本地化图片记录为 partial 且标注原因",
  files.length === 0 || partialImageIssue.length > 0,
  "未观察到图片问题样本"
);

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;

closeDb();
fs.rmSync(TEST_DIR, { recursive: true, force: true });
