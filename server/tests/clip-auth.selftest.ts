// 剪藏接口的 Token 鉴权自测（不联网、不碰数据库）
// 用法: node tests/clip-auth.selftest.ts
import { createClipServer } from "../src/clipServer.ts";
import type { AddressInfo } from "node:net";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

// 设了 Token → 必须带对 Authorization
process.env.CLIP_TOKEN = "test-token-123";
const server = createClipServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

{
  const res = await fetch(`${base}/api/health`);
  check("健康检查不需要 Token", res.status === 200, String(res.status));
}

{
  const res = await fetch(`${base}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/a" }),
  });
  check("不带 Token → 401", res.status === 401, String(res.status));
}

{
  const res = await fetch(`${base}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-token" },
    body: JSON.stringify({ url: "https://example.com/a" }),
  });
  check("Token 错误 → 401", res.status === 401, String(res.status));
}

{
  const res = await fetch(`${base}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token-123" },
    body: JSON.stringify({ url: "不是网址" }),
  });
  // 通过鉴权后才会校验 url（422 = 鉴权过了、参数不合法）
  check("Token 正确 → 进入业务校验（422）", res.status === 422, String(res.status));
}

{
  const res = await fetch(`${base}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "bearer test-token-123" },
    body: JSON.stringify({ url: "不是网址" }),
  });
  check("Bearer 大小写不敏感", res.status === 422, String(res.status));
}

server.close();

// 不配 Token → 本机自用，不鉴权
delete process.env.CLIP_TOKEN;
const open = createClipServer();
await new Promise<void>((resolve) => open.listen(0, "127.0.0.1", () => resolve()));
const openPort = (open.address() as AddressInfo).port;
{
  const res = await fetch(`http://127.0.0.1:${openPort}/api/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "不是网址" }),
  });
  check("没配 Token → 不鉴权（本地自用模式）", res.status === 422, String(res.status));
}
open.close();

console.log(failed === 0 ? "\n全部通过 ✅" : `\n失败 ${failed} 项 ❌`);
process.exit(failed === 0 ? 0 : 1);
