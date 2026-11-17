/**
 * 搜索观测 · 步骤 3：去掉范围过滤后的全局搜索
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 1700;
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
  await sleep(1200);
};
const type = async (text) => {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: '', windowsVirtualKeyCode: 0, text: ch, unmodifiedText: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: '', windowsVirtualKeyCode: 0 });
    await sleep(90);
  }
  await sleep(1500);
};
const esc = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(500);
};
const readResults = () => ev(`(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 210 && r.x <= 990 && r.y >= 90 && r.y <= 560 && r.width > 0 && e.children.length === 0 && (e.textContent||'').trim().length > 0;
  });
  const seen = new Set();
  for (const e of all) {
    const txt = (e.textContent||'').trim();
    if (seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ y: Math.round(r.y), t: txt.slice(0, 32) });
  }
  return out.sort((a,b) => a.y - b.y).slice(0, 32);
})()`);

// 1. 开搜索，输入 配置
await click(1170, 33);
await sleep(600);
await type('配置');

// 2. 点范围 chip 的 ×（去范围过滤）——chip 位于页签行 y≈143、x≈646 右侧的 ×
const chipX = await ev(`(() => {
  // 找 chip 容器：文本 学习进度 且蓝底
  const els = [...document.querySelectorAll('div,span,button,svg')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.y >= 130 && r.y <= 160 && r.x >= 590 && r.x <= 700 && r.width > 0;
  });
  return els.map(e => { const r = e.getBoundingClientRect(); return Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + e.tagName + ':' + (e.textContent||'').trim().slice(0,10); });
})()`);
console.log('chip 区域元素:', JSON.stringify(chipX, null, 1));

// chip 的 × 通常在 chip 右缘 ~672
await click(672, 143);
await sleep(1200);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/55-搜索-去范围过滤.png');
console.log('去掉范围后结果:', JSON.stringify(await readResults(), null, 1).slice(0, 2200));

ws.close();
process.exit(0);
