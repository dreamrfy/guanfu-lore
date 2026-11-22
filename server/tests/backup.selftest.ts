// 服务端备份接口自测（R2 未配置路径：401 鉴权 / 400 r2_not_configured / 列表空）
// R2 真实上传路径在 VPS 生产环境 E2E 验证（凭证不上库）。
// 用法: node tests/backup.selftest.ts
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const REL_DIR = path.join("out", "test-server-backup");
const tmpDir = path.resolve(import.meta.dirname, "..", REL_DIR);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.env.KF_DATA_DIR = REL_DIR;
process.env.CLIP_TOKEN = "server-backup-test";
// 不设 R2_* 环境变量 → r2_not_configured 路径

const { createClipServer } = await import("../src/clipServer.ts");
const server = createClipServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const headers = { "Content-Type": "application/json", Authorization: "Bearer server-backup-test" };

{
  const res = await fetch(`${base}/api/backup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("不带 Token 上传备份 → 401", res.status === 401, String(res.status));
}
{
  const payload = JSON.stringify({ kind: "ge-ren-zhi-shi-ku.backup", version: 1, pages: [{ id: "p1" }], exportedAt: Date.now() });
  const res = await fetch(`${base}/api/backup`, { method: "POST", headers, body: payload });
  const json = await res.json();
  check("R2 未配置上传 → 400 r2_not_configured", res.status === 400 && json.code === "r2_not_configured", JSON.stringify(json));
}
{
  const res = await fetch(`${base}/api/backup`, { headers });
  const json = await res.json();
  check("R2 未配置列表 → 400 r2_not_configured", res.status === 400 && json.code === "r2_not_configured", JSON.stringify(json));
}
{
  const res = await fetch(`${base}/api/backup/get?key=backups/x.json`, { headers });
  check("R2 未配置下载 → 400 r2_not_configured", res.status === 400, String(res.status));
}

server.close();
console.log(failed === 0 ? "\n全部通过 ✅" : `\n存在失败 ❌（${failed}）`);
process.exit(failed === 0 ? 0 : 1);