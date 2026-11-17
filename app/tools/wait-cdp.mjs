// 轮询 WebView2 CDP 端口直到可连，输出可连接确认
// 用法: npm run wait-cdp  （CDP_PORT 环境变量选端口，默认 9222；超时 25 分钟）
const port = process.env.CDP_PORT || "9222";
const deadline = Date.now() + 25 * 60 * 1000;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const v = await r.json();
      console.log(`CDP-READY(${port}) ` + (v.Browser ?? ""));
      process.exit(0);
    }
  } catch {
    /* 未就绪继续等 */
  }
  await new Promise((r) => setTimeout(r, 3000));
}
console.error("CDP-TIMEOUT");
process.exit(1);
