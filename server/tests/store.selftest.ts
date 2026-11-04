// 本地存储层自测（落库 / 读回 / 幂等 / 资源落盘 / 清单查询）
// 用法: node tests/store.selftest.ts
//
// 关键：先设 KF_DATA_DIR 再动态 import，确保用【隔离的测试库】，不污染正式数据。
// 清理路径用绝对路径（P2-03），从任何 cwd 运行都不会残留目录。
process.env.KF_DATA_DIR = "data-selftest";
process.env.KF_ASSETS_DIR = "data-selftest/assets";

const { saveClip, getClip, listClips, writeAssetFile, closeDb } = await import("../src/store/localStore.ts");
import fs from "node:fs";
import path from "node:path";
import type { Clip } from "../src/store/types.ts";

/** server 根目录（tests 的上一级），用于绝对路径清理 */
const SERVER_ROOT = path.dirname(import.meta.dirname);
const TEST_DATA_DIR = path.join(SERVER_ROOT, "data-selftest");

const savedAt = new Date().toISOString();

function fakeClip(id: string, title: string, withImage: boolean): Clip {
  return {
    id,
    source: "wechat_mp",
    sourceUrl: "https://mp.weixin.qq.com/s?__biz=test&mid=1&idx=" + id + "&sn=abc",
    title,
    author: "测试作者",
    account: "测试公众号",
    publishedAt: "2026-11-01T00:00:00.000Z",
    savedAt,
    text: "这是" + title + "的正文。",
    assets: withImage ? [{ assetId: "abcdef123456", provider: "local", ext: "png" }] : [],
    status: "complete",
    failReason: null,
  };
}

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const c1 = fakeClip("hash-1", "第一篇测试", true);
const c2 = fakeClip("hash-2", "第二篇测试", false);

saveClip(c1);
saveClip(c2);
// 幂等：重复存同一条，不应产生第二条记录
saveClip(c1);

const listed = listClips();
const got1 = getClip("hash-1");
const got2 = getClip("hash-2");

check("listClips 返回 2 条（幂等去重生效）", listed.length === 2, String(listed.length));
check("getClip(hash-1) 标题正确", got1?.title === "第一篇测试");
check(
  "getClip(hash-1) assets 是编号引用（G1）",
  JSON.stringify(got1?.assets) === JSON.stringify([{ assetId: "abcdef123456", provider: "local", ext: "png" }]),
  JSON.stringify(got1?.assets)
);
check("getClip(hash-1) 正文正确", got1?.text === "这是第一篇测试的正文。");
check("getClip(hash-2) 存在且无图片", got2 !== null && got2!.assets.length === 0);

// 资源落盘验证：写入一个文件 → 存在 → 读回一致
const png = Buffer.from("89504e470d0a1a0a", "hex");
const written = writeAssetFile("abcdef1234567890", "png", png);
const okFile = fs.existsSync(written) && fs.readFileSync(written).equals(png);
check("资源落盘与读回", okFile);

// 路径/编号白名单
for (const bad of ["../evil", "abc", "ABCDEF1234567890", "abcdef12345678901234"]) {
  let rejected = false;
  try {
    writeAssetFile(bad, "png", png);
  } catch {
    rejected = true;
  }
  check("拒绝非法 assetId：" + bad, rejected);
}
for (const badExt of ["../x", "p", "verylongext", "PNG"]) {
  let rejected = false;
  try {
    writeAssetFile("abcdef1234567890", badExt, png);
  } catch {
    rejected = true;
  }
  check("拒绝非法扩展名：" + badExt, rejected);
}

// 清单查询：批量插入 300 条，校验排序与耗时（P2-02 单查询实现）
const started = Date.now();
for (let i = 0; i < 300; i++) {
  const clip = fakeClip("bulk-" + i, "批量" + i, false);
  clip.savedAt = new Date(Date.parse("2026-01-01T00:00:00.000Z") + i * 1000).toISOString();
  saveClip(clip);
}
const startedList = Date.now();
const all = listClips();
const listMs = Date.now() - startedList;
check("批量 300 条全部读回", all.length === 302, String(all.length));
const sorted = all.every((c, i) => i === 0 || String(all[i - 1]!.savedAt) <= String(c.savedAt));
check("清单按 saved_at 升序", sorted);
check("清单读取耗时可接受（" + listMs + "ms）", listMs < 500, listMs + "ms");
void started;

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;

// 清理测试库（先关连接，Windows 下不关连接就无法删目录）
closeDb();
fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
