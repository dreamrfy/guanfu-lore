// 通过 CDP 优雅关闭浏览器（Chrome 会走正常退出流程，把 cookie 落盘）
const res = await fetch('http://127.0.0.1:9222/json/version');
const { webSocketDebuggerUrl } = await res.json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
await new Promise((r) => setTimeout(r, 3000));
console.log('已发送 Browser.close');
process.exit(0);
