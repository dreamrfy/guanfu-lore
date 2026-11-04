// 离线导入状态自测（第三轮 T-01 / T-02 / T-05，含第二轮回归）
// 覆盖：外链图（img/srcset/source/ CSS 背景）、data-src 优先级、缺失本地文件、
//       位图 data URI、SVG data URI、攻击者 CSP（含属性值里带 >）、sourceUrl 契约。
// 用法: node tests/offline.selftest.ts
import fs from "node:fs";
import path from "node:path";

// 必须在 import 业务模块之前设置隔离目录（config 在模块加载时读取环境变量）
process.env.KF_DATA_DIR = "data-selftest-offline";
process.env.KF_ASSETS_DIR = "data-selftest-offline/assets";
process.env.KF_OUT_DIR = "data-selftest-offline/out";

const { ingestOfflineHtml } = await import("../src/pipeline.ts");
const { closeDb, readAssetFile } = await import("../src/store/localStore.ts");
const { OUT_DIR, ASSETS_DIR } = await import("../src/config.ts");
const { auditSnapshotImages } = await import("../src/fetch/snapshot.ts");

const SERVER_ROOT = path.dirname(import.meta.dirname);
const TEST_DIR = path.join(SERVER_ROOT, "data-selftest-offline");
/** 一个真实存在的本地图片文件（相对引用必须能找到它才算成功） */
const LOCAL_IMG = "abc1234567890abc.png";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function page(opts: { title: string; body: string; mid: number; csp?: string; head?: string }): string {
  // 每个样例用不同 mid，避免被幂等逻辑当成同一篇
  const source =
    "https://mp.weixin.qq.com/s?__biz=MzkyNDA5MjgyNw==&mid=" +
    String(opts.mid) +
    "&idx=1&sn=5a8fa81a2ad2b093f87455a9f7a35716";
  const escaped = source.replace(/&/g, "&amp;");
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    (opts.csp ? `<meta http-equiv="Content-Security-Policy" content="${opts.csp}">` : "") +
    (opts.head ?? "") +
    "<title>" +
    opts.title +
    "</title></head><body>" +
    `<h1>${opts.title}</h1>` +
    `<div class="meta">测试号 · 发布于 2026-11-01 · 原文：<a href="${escaped}">原文</a></div>` +
    `<div id="js_content">${opts.body}</div>` +
    "</body></html>"
  );
}

const TEXT = "<p>正文文字足够多，用于验证状态判定。</p>";

/** 只用固定文件名写入样例（不拼接外部输入） */
const FIXTURES: Array<{ name: string; html: string }> = [
  {
    name: "offline_2001.html",
    html: page({ title: "外链 img", mid: 2001, body: TEXT + '<img src="https://mmbiz.qpic.cn/a.png">' }),
  },
  {
    name: "offline_2002.html",
    html: page({ title: "位图 data URI", mid: 2002, body: TEXT + '<img src="data:image/png;base64,iVBORw0KGgo=">' }),
  },
  {
    name: "offline_2003.html",
    html: page({ title: "本地相对引用", mid: 2003, body: TEXT + '<img src="' + LOCAL_IMG + '">' }),
  },
  { name: "offline_2004.html", html: page({ title: "无 src", mid: 2004, body: TEXT + "<img alt=\"无地址\">" }) },
  {
    name: "offline_2005.html",
    html: page({
      title: "SVG data URI + 攻击者 CSP",
      mid: 2005,
      body: TEXT + '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
      csp: "script-src *",
    }),
  },
  { name: "offline_2006.html", html: page({ title: "空正文", mid: 2006, body: "<p> </p>" }) },
  {
    name: "offline_2007.html",
    html: page({
      title: "picture/source 外链",
      mid: 2007,
      body: TEXT + '<picture><source srcset="https://evil.example/x.png"><img src="' + LOCAL_IMG + '"></picture>',
    }),
  },
  {
    name: "offline_2008.html",
    html: page({
      title: "img srcset 外链",
      mid: 2008,
      body: TEXT + '<img srcset="https://evil.example/y.png 1x, ' + LOCAL_IMG + ' 2x">',
    }),
  },
  {
    name: "offline_2009.html",
    html: page({
      title: "data-src 掩盖外链",
      mid: 2009,
      body: TEXT + '<img src="https://evil.example/z.png" data-src="' + LOCAL_IMG + '">',
    }),
  },
  {
    name: "offline_2010.html",
    html: page({ title: "相对文件不存在", mid: 2010, body: TEXT + '<img src="missing.png">' }),
  },
  {
    name: "offline_2011.html",
    html: page({
      title: "CSS 背景图",
      mid: 2011,
      body: TEXT + '<div style="background-image:url(data:image/svg+xml;base64,PHN2Zz4=)">x</div>',
      head: "<style>.a{background:url(javascript:alert(1))}</style>",
    }),
  },
  {
    name: "offline_2012.html",
    html: page({ title: "CSP 值里带 >", mid: 2012, body: TEXT, csp: "default-src * > script-src *" }),
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });
fs.writeFileSync(path.join(ASSETS_DIR, LOCAL_IMG), Buffer.from("89504e470d0a1a0a", "hex"));

for (const fixture of FIXTURES) {
  if (!/^offline_\d+\.html$/.test(fixture.name)) throw new Error("样例文件名非法");
  fs.writeFileSync(path.join(OUT_DIR, fixture.name), fixture.html, "utf8");
}

function ingest(name: string) {
  if (!/^offline_\d+\.html$/.test(name)) throw new Error("样例文件名非法");
  return ingestOfflineHtml(path.join(OUT_DIR, name)).clip;
}

function snapshotOf(assetId: string): string {
  const buf = readAssetFile({ assetId, provider: "local", ext: "html" });
  return buf ? buf.toString("utf8") : "";
}

// ---- 基础状态 ----
const r1 = ingest("offline_2001.html");
check("外链 img → partial", r1.status === "partial", r1.status);
check("外链 img → images_failed", r1.failReason === "images_failed", String(r1.failReason));
check("外链 img note 说明", (r1.note ?? "").includes("外链"), String(r1.note));

const r2 = ingest("offline_2002.html");
check("位图 data URI → complete", r2.status === "complete" && r2.failReason === null, `${r2.status}/${r2.failReason}`);

const r3 = ingest("offline_2003.html");
check("本地相对引用（文件存在）→ complete", r3.status === "complete", `${r3.status}/${r3.failReason}`);

const r4 = ingest("offline_2004.html");
check("无 src 的 img → partial", r4.status === "partial", `${r4.status}/${r4.failReason}`);

const r5 = ingest("offline_2005.html");
check("SVG data URI → partial", r5.status === "partial", `${r5.status}/${r5.failReason}`);

const r6 = ingest("offline_2006.html");
check("空正文 → failed", r6.status === "failed" && r6.failReason === "content_missing", `${r6.status}/${r6.failReason}`);

// ---- T-01：非 img src 的图片来源不得绕过 ----
const r7 = ingest("offline_2007.html");
check("picture/source 外链 → partial", r7.status === "partial", `${r7.status}/${r7.failReason}`);

const r8 = ingest("offline_2008.html");
check("img srcset 外链 → partial", r8.status === "partial", `${r8.status}/${r8.failReason}`);

const r9 = ingest("offline_2009.html");
check("data-src 掩盖外链 → partial（按真实 src 判定）", r9.status === "partial", `${r9.status}/${r9.failReason}`);

const r10 = ingest("offline_2010.html");
check("相对文件不存在 → partial", r10.status === "partial", `${r10.status}/${r10.failReason}`);
check("缺失文件 note 说明", (r10.note ?? "").includes("缺失"), String(r10.note));

const r11 = ingest("offline_2011.html");
check("CSS 背景图 SVG → partial", r11.status === "partial", `${r11.status}/${r11.failReason}`);

// ---- 审计函数本身：计数口径 ----
const audit2007 = auditSnapshotImages(FIXTURES[6]!.html, ASSETS_DIR);
check("审计：source 外链计为 external", audit2007.external === 1 && audit2007.local === 1, JSON.stringify(audit2007));
const audit2008 = auditSnapshotImages(FIXTURES[7]!.html, ASSETS_DIR);
check("审计：srcset 外链计为 external", audit2008.external === 1 && audit2008.local === 1, JSON.stringify(audit2008));
const audit2010 = auditSnapshotImages(FIXTURES[9]!.html, ASSETS_DIR);
check("审计：缺失文件计为 missing", audit2010.missing === 1, JSON.stringify(audit2010));
const audit2009 = auditSnapshotImages(FIXTURES[8]!.html, ASSETS_DIR);
check("审计：data-src 不掩盖真实 src", audit2009.external === 1, JSON.stringify(audit2009));

// ---- T-02：落盘快照里不得残留外链/srcset/CSS 危险引用 ----
const snap2007 = snapshotOf(r7.assets[0]!.assetId);
check("快照移除 source 外链", !/evil\.example/.test(snap2007), snap2007.slice(0, 300));
check("快照保留本地图片", /src="abc1234567890abc\.png"/.test(snap2007), snap2007.slice(0, 300));

const snap2008 = snapshotOf(r8.assets[0]!.assetId);
check("快照过滤 srcset 外链", !/evil\.example/.test(snap2008), snap2008.slice(0, 300));
check("快照保留 srcset 本地候选", /abc1234567890abc\.png/.test(snap2008), snap2008.slice(0, 300));

const snap2009 = snapshotOf(r9.assets[0]!.assetId);
check("快照移除外链 src", !/src="https:\/\/evil\.example/.test(snap2009), snap2009.slice(0, 300));
check("快照不保留 data-src", !/data-src=/.test(snap2009), snap2009.slice(0, 300));

const snap2011 = snapshotOf(r11.assets[0]!.assetId);
check("快照移除 CSS 里的 SVG", !/image\/svg\+xml/.test(snap2011), snap2011.slice(0, 400));
check("快照移除 CSS 里的 javascript:", !/javascript:/i.test(snap2011), snap2011.slice(0, 400));

// ---- T-05：CSP 属性值含 > 时只保留项目 CSP ----
const r12 = ingest("offline_2012.html");
const snap2012 = snapshotOf(r12.assets[0]!.assetId);
check("CSP 攻击者片段不残留", !snap2012.includes("script-src *"), snap2012.slice(0, 300));
const cspCount = (snap2012.match(/http-equiv="Content-Security-Policy"/gi) ?? []).length;
check("快照只有 1 个项目 CSP", cspCount === 1, "CSP 数量=" + cspCount);
check("项目 CSP 是 default-src 'none'", snap2012.includes("default-src 'none'"), snap2012.slice(0, 200));

// ---- N-11：sourceUrl / canonicalUrl 契约 ----
check("sourceUrl 保留原始参数", r1.sourceUrl.includes("__biz"), r1.sourceUrl);
check("canonicalUrl 已规范化", !!r1.canonicalUrl && !r1.canonicalUrl.includes("mpshare"), String(r1.canonicalUrl));

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;

closeDb();
fs.rmSync(TEST_DIR, { recursive: true, force: true });
