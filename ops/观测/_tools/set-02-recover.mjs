/**
 * 设置观测 · 步骤 2：一次串完 —— 回空间页 → 等载入 → 展开侧栏 → 点 ⌄ → 读菜单
 * 每步截图核对，防坐标系漂移。
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 2300;
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

// 1. 回空间页（工作区根）
await ev(`location.href = 'https://flowus.cn/0e207dcb-a6fe-40d8-8867-af42cf465a72#454f8ec5-de0c-429d-bb07-b03af764edd7'`);
await sleep(2500);
console.log('A. 回页:', await ev('document.title'));

// 2. 找侧栏展开钮（»）：DOM 定位
const expand = await ev(`(() => {
  const els = [...document.querySelectorAll('div,button')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x < 60 && r.y >= 10 && r.y <= 60 && r.width >= 20 && r.width <= 40 && r.height >= 20 && r.height <= 40;
  });
  const e = els[0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
})()`);
console.log('B. 展开钮:', JSON.stringify(expand));
if (expand && expand !== 'TIMEOUT') {
  await click(expand.x, expand.y);
  await sleep(800);
}

// 3. 找工作区 ⌄（工作区行右端的小箭头按钮）
const chevron = await ev(`(() => {
  // 工作区行 y 8~46；⌄ 是最后一个 20×20 小钮
  const els = [...document.querySelectorAll('svg,div')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 180 && r.x <= 230 && r.y >= 8 && r.y <= 46 && r.width >= 10 && r.width <= 24;
  });
  const e = els[els.length - 1];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), n: els.length };
})()`);
console.log('C. ⌄ 钮:', JSON.stringify(chevron));
if (chevron && chevron !== 'TIMEOUT') {
  await click(chevron.x, chevron.y);
  await sleep(900);
  await shot('E:/VBcoding/bijiapp/ops/观测/windows/70-头像菜单.png');
  const items = await ev(`(() => {
    const out = [];
    const all = [...document.querySelectorAll('div,span')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.x < 400 && r.y > 40 && r.width > 0 && e.children.length === 0 && (e.textContent||'').trim().length > 0 && (e.textContent||'').trim().length < 25;
    });
    const seen = new Set();
    for (const e of all) {
      const txt = (e.textContent||'').trim();
      if (seen.has(txt)) continue;
      seen.add(txt);
      const r = e.getBoundingClientRect();
      out.push(Math.round(r.y) + ',' + Math.round(r.x) + ' ' + txt.slice(0, 22));
    }
    return out.slice(0, 30);
  })()`);
  console.log('D. 菜单项:', JSON.stringify(items, null, 1));
}
ws.close();
process.exit(0);
