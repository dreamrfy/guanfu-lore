// 响应体上限自测（P1-06）
// 用本机临时 HTTP 服务验证：Content-Length 超限、无 Content-Length 的分块响应超限都会被拒绝，
// 正常大小不受影响。注意：这里直接调用 requestOnce（跳过 DNS/SSRF 校验），只测上限逻辑。
// 用法: node tests/http-limit.selftest.ts
import http from "node:http";
import { requestOnce, FetchError } from "../src/fetch/http.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const BIG = 1024 * 1024; // 1MB

const server = http.createServer((req, res) => {
  if (req.url === "/with-length") {
    res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": String(BIG) });
    res.end(Buffer.alloc(BIG, 0x61));
    return;
  }
  if (req.url === "/chunked") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    const chunk = Buffer.alloc(64 * 1024, 0x62);
    let sent = 0;
    const tick = () => {
      if (sent >= BIG) {
        res.end();
        return;
      }
      sent += chunk.length;
      res.write(chunk);
      setImmediate(tick);
    };
    tick();
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("hello");
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const port = (server.address() as { port: number }).port;
const base = "http://127.0.0.1:" + port;

async function expectTooLarge(path: string): Promise<void> {
  const target = new URL(base + path);
  try {
    await requestOnce(target, { method: "GET", headers: {}, maxBytes: 4096, timeoutMs: 5000 });
    check(path + " 应被拒绝", false, "未抛错");
  } catch (e) {
    const ok = e instanceof FetchError && e.code === "ETOOLARGE";
    check(path + " 超限被拒绝（ETOOLARGE）", ok, String((e as Error).message));
  }
}

await expectTooLarge("/with-length");
await expectTooLarge("/chunked");

// 正常响应不受影响
const okRes = await requestOnce(new URL(base + "/small"), {
  method: "GET",
  headers: {},
  maxBytes: 4096,
  timeoutMs: 5000,
});
check("正常响应可读取", okRes.body.toString("utf8") === "hello" && okRes.status === 200);

// 上限恰好等于内容长度时应放行（边界）
const exact = await requestOnce(new URL(base + "/small"), {
  method: "GET",
  headers: {},
  maxBytes: 5,
  timeoutMs: 5000,
});
check("等于上限时放行", exact.body.length === 5);

server.close();
console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
