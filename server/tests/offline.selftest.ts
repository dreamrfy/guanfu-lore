// 离线导入状态自测（第二轮 N-01 / N-02 / N-06 / N-11）
// 覆盖：外链图不得 complete、位图 data URI 与相对引用可 complete、SVG data URI 被拒、
//       攻击者自带 CSP 必须被替换、sourceUrl 保留原始链接。
// 用法: node tests/offline.selftest.ts
import fs from "node:fs";
import path from "node:path";

// 必须在 import 业务模块之前设置隔离目录（config 在模块加载时读取环境变量）
process.env.KF_DATA_DIR = "data-selftest-offline";
process.env.KF_ASSETS_DIR = "data-selftest-offline/assets";
process.env.KF_OUT_DIR = "data-selftest-offline/out";

const { ingestOfflineHtml } = await import("../src/pipeline.ts");
const { closeDb, readAssetFile } = await import("../src/store/localStore.ts");
const { OUT_DIR } = await import("../src/config.ts");

const SERVER_ROOT = path.dirname(import.meta.dirname);
const TEST_DIR = path.join(SERVER_ROOT, "data-selftest-offline");

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function page(opts: { title: string; body: string; mid: number; csp?: string }): string {
  // 每个样例用不同 mid，避免被幂等逻辑当成同一篇（否则后续样例会直接命中第一条记录）
  const source =
    "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=" +
    String(opts.mid) +
    "&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716";
  const escaped = source.replace(/&/g, "&amp;");
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    (opts.csp ? `<meta http-equiv="Content-Security-Policy" content="${opts.csp}">` : "") +
    "<title>" +
    opts.title +
    "</title></head><body>" +
    `<h1>${opts.title}</h1>` +
    `<div class="meta">测试号 · 发布于 2026-11-01 · 原文：<a href="${escaped}">原文</a></div>` +
    `<div id="js_content">${opts.body}</div>` +
    "</body></html>"
  );
}

/** 只用固定文件名写入样例（不拼接外部输入） */
const FIXTURES: Array<{ name: string; html: string }> = [
  {
    name: "offline_1001.html",
    html: page({
      title: "外链图文章",
      mid: 1001,
      body: '<p>正文文字足够多，用于验证状态判定。</p><img src="https://mmbiz.qpic.cn/a.png">',
    }),
  },
  {
    name: "offline_1002.html",
    html: page({
      title: "内嵌位图文章",
      mid: 1002,
      body: '<p>正文文字足够多，用于验证状态判定。</p><img src="data:image/png;base64,iVBORw0KGgo=">',
    }),
  },
  {
    name: "offline_1003.html",
    html: page({
      title: "相对引用文章",
      mid: 1003,
      body: '<p>正文文字足够多，用于验证状态判定。</p><img src="abc1234567890abc.png">',
    }),
  },
  {
    name: "offline_1004.html",
    html: page({
      title: "空 src 文章",
      mid: 1004,
      body: "<p>正文文字足够多，用于验证状态判定。</p><img alt=\"无地址\">",
    }),
  },
  {
    name: "offline_1005.html",
    html: page({
      title: "SVG data URI 文章",
      mid: 1005,
      body: '<p>正文文字足够多，用于验证状态判定。</p><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
      csp: "script-src *",
    }),
  },
  { name: "offline_1006.html", html: page({ title: "空正文文章", mid: 1006, body: "<p> </p>" }) },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const fixture of FIXTURES) {
  if (!/^offline_\d+\.html$/.test(fixture.name)) throw new Error("样例文件名非法");
  fs.writeFileSync(path.join(OUT_DIR, fixture.name), fixture.html, "utf8");
}

function ingest(name: string) {
  if (!/^offline_\d+\.html$/.test(name)) throw new Error("样例文件名非法");
  return ingestOfflineHtml(path.join(OUT_DIR, name)).clip;
}

const r1 = ingest("offline_1001.html");
check("外链图 → partial", r1.status === "partial", r1.status);
check("外链图 → images_failed", r1.failReason === "images_failed", String(r1.failReason));
check("外链图 note 说明未本地化", (r1.note ?? "").includes("外链"), String(r1.note));
check("外链图绝不 complete", r1.status !== "complete");

const r2 = ingest("offline_1002.html");
check("位图 data URI → complete", r2.status === "complete" && r2.failReason === null, `${r2.status}/${r2.failReason}`);

const r3 = ingest("offline_1003.html");
check("本地相对引用 → complete", r3.status === "complete", `${r3.status}/${r3.failReason}`);

const r4 = ingest("offline_1004.html");
check("无 src 的 img → partial", r4.status === "partial", `${r4.status}/${r4.failReason}`);

const r5 = ingest("offline_1005.html");
check("SVG data URI → partial（不放行）", r5.status === "partial", `${r5.status}/${r5.failReason}`);

const r6 = ingest("offline_1006.html");
check("空正文 → failed", r6.status === "failed" && r6.failReason === "content_missing", `${r6.status}/${r6.failReason}`);

// N-11：sourceUrl 保留原始链接，canonicalUrl 另存
check("sourceUrl 保留原始参数", r1.sourceUrl.includes("__biz"), r1.sourceUrl);
check("canonicalUrl 已规范化", !!r1.canonicalUrl && !r1.canonicalUrl.includes("mpshare"), String(r1.canonicalUrl));

// N-02：攻击者 CSP 必须被替换，不能被保留
const snapshotBuf = readAssetFile(r5.assets[0]!);
check("快照资源可读", !!snapshotBuf);
const snapshot = snapshotBuf ? snapshotBuf.toString("utf8") : "";
check("攻击者 CSP（script-src *）不残留", !snapshot.includes("script-src *"), "仍含攻击者 CSP");
const cspCount = (snapshot.match(/http-equiv="Content-Security-Policy"/gi) ?? []).length;
check("快照只有项目自己的 CSP（数量 1）", cspCount === 1, "CSP 数量=" + cspCount);
check("项目 CSP 是 default-src 'none'", snapshot.includes("default-src 'none'"), snapshot.slice(0, 200));
check("SVG data URI 未进入快照正文", !snapshot.includes("data:image/svg+xml"), "快照仍含 SVG");

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;

closeDb();
fs.rmSync(TEST_DIR, { recursive: true, force: true });
