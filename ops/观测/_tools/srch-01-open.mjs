/**
 * 搜索观测 · 步骤 1：桌面全局搜索入口
 * 入口 A：顶栏右侧放大镜（内容层 x≈1170, y≈33）
 * 入口 B：侧栏图标行第 3 钮（内容层 x=114, y=70）
 * 动作：分别点击 → 截图 → 读面板结构 → Escape
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 1500;
const pending = new Map();
const send = (method, params = {}, timeout = 6000) => new Promise((res) => {
  const i = id++;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); res(null); } }, timeout);
});
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const r = pending.get(m.id); pending.delete(m.id); r(m.result); } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (!r) return 'TIMEOUT';
  if (r.exceptionDetails) return 'ERR:' + (r.exceptionDetails.exception?.description || '').slice(0, 160);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r?.data) await writeFile(name, Buffer.from(r.data, 'base64'));
};
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(1000);
};
const esc = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(500);
};
const readOverlay = () => ev(`(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span,input,button')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 300 && r.width > 0 && r.width < 900 && r.y >= 0 && r.y < 700 && e.children.length === 0 && ((e.textContent||'').trim() || e.tagName === 'INPUT');
  });
  const seen = new Set();
  for (const e of all) {
    const txt = e.tagName === 'INPUT' ? ('INPUT:' + (e.placeholder || '')) : (e.textContent||'').trim();
    if (!txt || seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), t: txt.slice(0, 28) });
  }
  return out.sort((a,b) => a.y - b.y || a.x - b.x).slice(0, 40);
})()`);

// ---- 入口 A：顶栏放大镜 ----
console.log('== A. 顶栏放大镜 ==');
await click(1170, 33);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/50-搜索面板-顶栏入口.png');
const a = await readOverlay();
console.log(JSON.stringify(a, null, 1).slice(0, 2500));
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/50-搜索面板结构.json', JSON.stringify(a, null, 1));
await esc();

// ---- 入口 B：侧栏图标行第 3 钮 ----
console.log('== B. 侧栏图标行搜索 ==');
await click(114, 70);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/51-搜索面板-侧栏入口.png');
const b = await readOverlay();
console.log('与入口 A 一致:', JSON.stringify(b.map(i => i.t).slice(0, 8)));
await esc();

ws.close();
process.exit(0);
