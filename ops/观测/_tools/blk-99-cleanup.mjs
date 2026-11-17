/**
 * 块类型观测 · 清理：删除观测页「块类型观测-临时」（红线 4：核对名称）
 * 流程：侧栏行「…」→ 菜单「删除」→ 确认弹窗「删除」
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 1300;
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
  await sleep(900);
};

// 1. 核对侧栏观测页行 + 找它的「…」按钮（hover 才出现）
const row = await ev(`(() => {
  const els = [...document.querySelectorAll('div')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 30 && r.x <= 228 && e.children.length === 0 && (e.textContent||'').trim() === '块类型观测-临时';
  });
  const e = els[0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2) };
})()`);
console.log('观测页行:', JSON.stringify(row));
if (!row || row === 'TIMEOUT') { console.log('ABORT: 行没找到'); process.exit(1); }

// 2. hover 行 → 「…」出现 → 点它
await move(row.cx, row.cy);
await sleep(700);
const dots = await ev(`(() => {
  const els = [...document.querySelectorAll('div,button')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.y >= 290 && r.y <= 320 && r.x >= 180 && r.x <= 228 && r.width >= 16 && r.width <= 26 && r.height >= 16 && r.height <= 26;
  });
  const e = els[0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
})()`);
console.log('「…」按钮:', JSON.stringify(dots));
if (!dots || dots === 'TIMEOUT') { console.log('ABORT: dots 没找到'); process.exit(1); }
await click(dots.x, dots.y);
await sleep(800);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/42-行菜单.png');

// 3. 找菜单中的「删除」项（核对菜单内容先）
const menuItems = await ev(`(() => {
  const els = [...document.querySelectorAll('div,span')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x > 200 && r.x < 500 && r.y > 280 && r.y < 700 && r.width > 0 && e.children.length === 0 && (e.textContent||'').trim().length > 1 && (e.textContent||'').trim().length < 15;
  });
  return els.slice(0, 20).map(e => { const r = e.getBoundingClientRect(); return Math.round(r.y) + ',' + Math.round(r.x) + ' ' + (e.textContent||'').trim().slice(0, 12); });
})()`);
console.log('行菜单项:', JSON.stringify(menuItems, null, 1));
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/42-行菜单清单.json', JSON.stringify(menuItems, null, 1));
ws.close();
process.exit(0);
