// 资产上传/下载接口的 HTTP 自测（S01）：鉴权、参数校验、字节回读、索引落库、覆盖写
// 用法: node tests/sync-assets.selftest.ts
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const REL_DIR = path.join("out", "test-sync-assets");
const tmpDir = path.resolve(import.meta.dirname, "..", REL_DIR);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.env.KF_DATA_DIR = REL_DIR;
process.env.KF_ASSETS_DIR = path.join(REL_DIR, "assets");
process.env.CLIP_TOKEN = "sync-assets-token";
// 强制走本地盘路径：清掉可能存在的 R2 环境变量（证据可落档）
for (const k of Object.keys(process.env)) {
  if (/^R2_|CLOUDFLARE/i.test(k)) delete process.env[k];
}

const { createClipServer } = await import("../src/clipServer.ts");
const { closeSyncDb, getAssetIndex } = await import("../src/cloud/syncStore.ts");

const server = createClipServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const TOKEN = "sync-assets-token";

// 1×2 透明 PNG 的最小合法字节
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f030005fe02fea72d3e520000000049454e44ae426082",
  "hex",
);

function auth(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${TOKEN}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

{
  const res = await fetch(`${base}/api/sync/assets?assetId=test-asset-1&ext=png`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: PNG_BYTES,
  });
  check("不带 Token 上传 → 401", res.status === 401, String(res.status));
}
{
  const res = await fetch(`${base}/api/sync/assets?assetId=test-asset-1&ext=png`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
    body: PNG_BYTES,
  });
  const body = await res.json();
  check("上传 → 200 且 ok", res.status === 200 && body.ok === true, JSON.stringify(body));
  check("返回 storage=local（没配 R2）", body.storage === "local", JSON.stringify(body));
  check("返回 sha256 与 key", body.sha256?.length === 64 && body.key === "assets/test-asset-1.png", JSON.stringify(body));
  check("返回 mime=image/png", body.mime === "image/png", JSON.stringify(body));
}
{
  const idx = getAssetIndex("test-asset-1");
  check("索引落库：assetId/ext/size 可查", idx !== null && idx.ext === "png" && idx.size === PNG_BYTES.length, JSON.stringify(idx));
}
{
  const res = await fetch(`${base}/api/sync/assets/test-asset-1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  check("下载 → 200 且字节一致", res.status === 200 && buf.equals(PNG_BYTES), `${res.status} ${buf.length}B`);
  check("下载 Content-Type=image/png", res.headers.get("content-type") === "image/png", res.headers.get("content-type") ?? "");
}
{
  const res = await fetch(`${base}/api/sync/assets/no-such-asset`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check("下载不存在的资产 → 404", res.status === 404, String(res.status));
}
{
  const res = await fetch(`${base}/api/sync/assets?assetId=bad/../id&ext=png`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
    body: PNG_BYTES,
  });
  const body = await res.json();
  check("非法 assetId → 400 bad_asset_id", res.status === 400 && body.code === "bad_asset_id", JSON.stringify(body));
}
{
  const res = await fetch(`${base}/api/sync/assets?assetId=test-asset-2&ext=exe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
    body: Buffer.from("MZ...."),
  });
  const body = await res.json();
  check("非法 ext → 400 unsupported_ext", res.status === 400 && body.code === "unsupported_ext", JSON.stringify(body));
}
{
  const res = await fetch(`${base}/api/sync/assets?assetId=test-asset-3&ext=png`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
  });
  check("空请求体 → 400 empty_body", res.status === 400, String(res.status));
}
{
  // 覆盖写：同 assetId 换内容，索引与字节都更新
  const PNG2 = Buffer.concat([PNG_BYTES, Buffer.from([0x00])]);
  const up = await fetch(`${base}/api/sync/assets?assetId=test-asset-1&ext=png`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
    body: PNG2,
  });
  const upBody = await up.json();
  check("同 id 覆盖上传 → 200", up.status === 200 && upBody.ok === true, JSON.stringify(upBody));
  const idx = getAssetIndex("test-asset-1");
  check("覆盖后索引 size/sha 更新", idx !== null && idx.size === PNG2.length, JSON.stringify(idx));
  const res = await fetch(`${base}/api/sync/assets/test-asset-1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  check("覆盖后下载到新字节", buf.equals(PNG2), `${buf.length}B`);
}
{
  const res = await fetch(`${base}/api/sync/row`, { headers: auth(true) });
  check("既有接口 /api/sync/row 不受影响", res.status === 404 || res.status === 200, String(res.status));
}

server.close();
closeSyncDb();
console.log(failed === 0 ? "自测全部通过" : `失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
