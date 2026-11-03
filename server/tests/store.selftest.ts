// 任务5 自测：本地存储层（落库 / 读回 / 幂等 / 资源落盘）
// 用法: node tests/store.selftest.ts
//
// 关键：先设 KF_DATA_DIR 再动态 import，确保用【隔离的测试库】，不污染正式数据。
process.env.KF_DATA_DIR = "data-selftest";

const { saveClip, getClip, listClips, writeAssetFile } = await import("../src/store/localStore.ts");
import fs from "node:fs";
import path from "node:path";
import type { Clip } from "../src/store/types.ts";

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
    assets: withImage ? [{ assetId: "asset_" + id, provider: "local", ext: "png" }] : [],
    status: "complete",
    failReason: null,
  };
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

const results: Array<[string, boolean]> = [
  ["listClips 返回 2 条（幂等去重生效）", listed.length === 2],
  ["getClip(hash-1) 标题正确", got1?.title === "第一篇测试"],
  ["getClip(hash-1) assets 是编号引用（G1）", JSON.stringify(got1?.assets) === JSON.stringify([{ assetId: "asset_hash-1", provider: "local", ext: "png" }])],
  ["getClip(hash-1) 正文正确", got1?.text === "这是第一篇测试的正文。"],
  ["getClip(hash-2) 存在且无图片", got2 !== null && got2!.assets.length === 0],
];

let failed = 0;
for (const [name, ok] of results) {
  console.log((ok ? "✅" : "❌") + " " + name);
  if (!ok) failed++;
}

// 资源落盘验证：写入一个文件 → 存在 → 读回一致
const png = Buffer.from("89504e470d0a1a0a", "hex");
const written = writeAssetFile("abcdef1234567890", "png", png);
const okFile = fs.existsSync(written) && fs.readFileSync(written).equals(png);
console.log((okFile ? "✅" : "❌") + " 资源落盘与读回");
if (!okFile) failed++;

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;

// 清理测试库（先关连接，Windows 下不关连接就无法删目录）
const { closeDb } = await import("../src/store/localStore.ts");
closeDb();
fs.rmSync(path.resolve("data-selftest"), { recursive: true, force: true });
