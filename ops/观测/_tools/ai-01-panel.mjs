/**
 * AI 观测 · 步骤 1：桌面 AI 入口与面板
 * 入口：① 顶栏 ⚡（y≈33）② 右下 AI 浮钮（1144,640+19）③ 侧栏 FlowUs AI 行（44,106）
 * 流程：逐一点击 → 截图 → 读面板结构 → Escape
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 2000;
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
  await sleep(1300);
};
const esc = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(600);
};
const readOverlay = (x0) => ev(`(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span,input,button,textarea')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= ${x0} && r.width > 0 && r.y >= 40 && r.y < 720 && e.children.length === 0 && ((e.textContent||'').trim() || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA');
  });
  const seen = new Set();
  for (const e of all) {
    const txt = e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' ? ('INPUT:' + (e.placeholder || '')) : (e.textContent||'').trim();
    if (!txt || seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), t: txt.slice(0, 30) });
  }
  return out.sort((a,b) => a.y - b.y || a.x - b.x).slice(0, 40);
})()`);

// ---- 入口 ①：顶栏 ⚡ ----
console.log('== ① 顶栏 ⚡ ==');
await click(1088, 33);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/65-AI-顶栏闪电.png');
console.log(JSON.stringify(await readOverlay(230), null, 1).slice(0, 2200));
await esc();

// ---- 入口 ②：右下 AI 浮钮 ----
console.log('== ② 右下浮钮 ==');
await click(1162, 659);
await sleep(1400);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/66-AI-右下浮钮.png');
console.log(JSON.stringify(await readOverlay(230), null, 1).slice(0, 2200));
await esc();

// ---- 入口 ③：侧栏 FlowUs AI 行 ----
console.log('== ③ 侧栏 AI 行 ==');
await click(60, 106);
await sleep(1400);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/67-AI-侧栏面板.png');
console.log(JSON.stringify(await readOverlay(0), null, 1).slice(0, 2400));
await esc();

ws.close();
process.exit(0);
