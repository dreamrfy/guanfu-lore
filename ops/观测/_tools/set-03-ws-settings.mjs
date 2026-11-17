/**
 * 设置观测 · 步骤 3：空间设置（教训修正版）
 * 铁律：弹层菜单项必须先读 DOM 中心坐标 + 核对文本，再点击。
 * 流程：侧栏状态验证 → ⌄ → DOM 读菜单 → 点「空间设置」（核对名）→ 设置页截图 + 结构
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 2400;
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

// 0. 侧栏状态验证：工作区行必须在 DOM 且 y>0
const wsRow = await ev(`(() => {
  const rows = [...document.querySelectorAll('div,span')].filter(e => {
    const txt = (e.textContent||'').replace(/\\s+/g, '');
    if (txt !== '两相欢的空间') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.y >= 0 && r.y < 80 && r.x >= 0 && r.x < 230;
  });
  const e = rows[0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
})()`);
console.log('0. 工作区行:', JSON.stringify(wsRow));
if (!wsRow || wsRow === 'TIMEOUT') {
  // 侧栏没展开：点 » 展开
  console.log('侧栏未展开，点 » 展开');
  await click(30, 24);
  await sleep(800);
}

// 1. 找工作区 ⌄ 并点击
const chev = await ev(`(() => {
  // 工作区行容器内最后一个可点小钮（⌄）
  const row = [...document.querySelectorAll('div')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.y >= 4 && r.y <= 20 && r.x <= 12 && r.width >= 180 && r.width <= 230 && r.height >= 30 && r.height <= 44;
  })[0];
  if (!row) return null;
  const rr = row.getBoundingClientRect();
  const btns = [...row.querySelectorAll('div,button,svg')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x > rr.x + 140 && r.width >= 10 && r.width <= 24 && r.height >= 10 && r.height <= 24;
  });
  const b = btns[btns.length - 1];
  if (!b) return { rowRect: [Math.round(rr.x), Math.round(rr.y), Math.round(rr.width), Math.round(rr.height)], fallback: true };
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
})()`);
console.log('1. ⌄:', JSON.stringify(chev));
if (!chev || chev === 'TIMEOUT') { console.log('ABORT: 找不到工作区行'); process.exit(1); }
const chevPt = chev.fallback ? { x: 147, y: 27 } : chev;
await click(chevPt.x, chevPt.y);
await sleep(1000);

// 2. DOM 读菜单项（带坐标）—— 弹层菜单挂在 portal
const menuItems = await ev(`(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span')].filter(e => {
    const r = e.getBoundingClientRect();
    const txt = (e.textContent||'').trim();
    return r.width > 0 && r.height > 0 && r.height < 45 && txt.length >= 2 && txt.length <= 12 && r.x < 320 && r.y < 500 && e.children.length === 0;
  });
  const seen = new Set();
  for (const e of all) {
    const txt = (e.textContent||'').trim();
    if (seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ t: txt, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  }
  return out;
})()`);
console.log('2. 菜单项（DOM 坐标）:', JSON.stringify(menuItems, null, 1));
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/70-头像菜单DOM.json', JSON.stringify(menuItems, null, 1));

// 3. 核对「空间设置」存在才点
const target = Array.isArray(menuItems) && menuItems.find(i => i.t === '空间设置');
if (!target) { console.log('ABORT: 菜单里没有「空间设置」——不点任何东西'); await shot('E:/VBcoding/bijiapp/ops/观测/windows/70-菜单异常.png'); ws.close(); process.exit(1); }
console.log('3. 核对通过，点「空间设置」@', target.x, target.y);
await click(target.x, target.y);
await sleep(1500);

// 4. 设置页截图 + 结构
await shot('E:/VBcoding/bijiapp/ops/观测/windows/71-空间设置页.png');
console.log('4. URL:', await ev('location.href.slice(0, 60)'));
const struct = await ev(`(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span,h1,h2,h3,button,input')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && e.children.length === 0 && ((e.textContent||'').trim().length > 0 && (e.textContent||'').trim().length < 40 || e.tagName === 'INPUT');
  });
  const seen = new Set();
  for (const e of all) {
    const txt = e.tagName === 'INPUT' ? 'INPUT:' + (e.placeholder || e.type || '') : (e.textContent||'').trim();
    if (!txt || seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push(Math.round(r.y) + ',' + Math.round(r.x) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + txt.slice(0, 30));
  }
  return out.slice(0, 50);
})()`);
console.log('设置页结构:', JSON.stringify(struct, null, 1).slice(0, 3000));
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/71-设置页结构.json', JSON.stringify(struct, null, 1));
ws.close();
process.exit(0);
