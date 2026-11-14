// 同步接口的 HTTP 自测（Token 鉴权 + pull/push/冲突处理）
// 用法: node tests/sync-api.selftest.ts
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const REL_DIR = path.join("out", "test-sync-api");
const tmpDir = path.resolve(import.meta.dirname, "..", REL_DIR);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.env.KF_DATA_DIR = REL_DIR;
process.env.KF_ASSETS_DIR = path.join(REL_DIR, "assets");
process.env.CLIP_TOKEN = "sync-test-token";

const { createClipServer } = await import("../src/clipServer.ts");
const { closeSyncDb } = await import("../src/cloud/syncStore.ts");

const server = createClipServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const auth = { "Content-Type": "application/json", Authorization: "Bearer sync-test-token" };

{
  const res = await fetch(`${base}/api/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes: [] }),
  });
  check("不带 Token → 401", res.status === 401, String(res.status));
}

{
  const res = await fetch(`${base}/api/sync/push`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      changes: [
        { entity: "page", entityId: "p-http", op: "upsert", payload: { title: "网页端" }, baseSeq: 0, actor: "web" },
      ],
    }),
  });
  const body = await res.json();
  check("带 Token 推送 → 200 且 applied", res.status === 200 && body.results?.[0]?.status === "applied", JSON.stringify(body));
  check("返回 nextSeq", typeof body.nextSeq === "number" && body.nextSeq > 0, String(body.nextSeq));
}

{
  const res = await fetch(`${base}/api/sync/pull`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ since: 0 }),
  });
  const body = await res.json();
  check("拉取能拿到刚才那条", body.changes?.length === 1, JSON.stringify(body.changes?.length));
  check("拉取内容含载荷", body.changes?.[0]?.payload?.includes("网页端") === true, String(body.changes?.[0]?.payload));
}

{
  // 用旧版本号再推一次 → 冲突
  const res = await fetch(`${base}/api/sync/push`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      changes: [
        { entity: "page", entityId: "p-http", op: "upsert", payload: { title: "旧版本" }, baseSeq: 0, actor: "web2" },
      ],
    }),
  });
  const body = await res.json();
  check("旧版本号 → conflict", body.results?.[0]?.status === "conflict", JSON.stringify(body.results));
}

{
  const res = await fetch(`${base}/api/sync/conflicts`, { method: "GET", headers: auth });
  const body = await res.json();
  check("冲突列表能查到", body.count === 1 && body.conflicts?.[0]?.entityId === "p-http", JSON.stringify(body.count));
  const id = body.conflicts?.[0]?.id;
  const res2 = await fetch(`${base}/api/sync/conflicts/resolve`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ id, action: "keep-server" }),
  });
  const body2 = await res2.json();
  check("处理冲突成功", res2.status === 200 && body2.ok === true, JSON.stringify(body2));
}

{
  const res = await fetch(`${base}/api/sync/conflicts/resolve`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ id: 999999, action: "use-mine" }),
  });
  check("处理不存在的冲突 → 404", res.status === 404, String(res.status));
}

{
  // 取某一行当前内容（客户端做差异对比用）
  const res = await fetch(`${base}/api/sync/row?entity=page&entityId=p-http`, { headers: auth });
  const body = await res.json();
  check("取行 → 200 且带 seq", res.status === 200 && typeof body.seq === "number", JSON.stringify(body));
  check("取行 → 返回当前载荷", !!body.payload, JSON.stringify(body.payload));

  const missing = await fetch(`${base}/api/sync/row?entity=page&entityId=not-exist`, { headers: auth });
  check("取不存在的行 → 404", missing.status === 404, String(missing.status));
}

server.close();
closeSyncDb();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log(failed === 0 ? "\n全部通过 ✅" : `\n失败 ${failed} 项 ❌`);
process.exit(failed === 0 ? 0 : 1);
