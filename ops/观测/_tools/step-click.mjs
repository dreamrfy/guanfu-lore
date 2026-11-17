/**
 * 微步探针：click-and-die —— 连 WS → 点击一个坐标 → 立刻退出（不等反应、不截图）
 * 用法: node step-click.mjs <x> <y>
 * 截图和读状态交给 diag-shot.mjs（独立进程）。
 */
const [x, y] = [parseInt(process.argv[2]), parseInt(process.argv[3])];
if (!Number.isFinite(x) || !Number.isFinite(y)) { console.log('usage: node step-click.mjs x y'); process.exit(1); }
(async () => {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const target = list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus'));
  if (!target) { console.log('no-webview'); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; setTimeout(() => j(new Error('ws-timeout')), 6000); });
  const send = (method, params = {}) => new Promise((res) => { ws.send(JSON.stringify({ id: Date.now() % 100000, method, params })); setTimeout(() => res(null), 2500); });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  console.log(`clicked (${x},${y})`);
  ws.close();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.log('ERR:', e.message); process.exit(1); });
