/**
 * 搜索观测 · 步骤 4：全局搜索完整交互（一次会话内完成，Escape 防丢）
 * 流程：开搜索 → 输入「配置」→ 去范围 chip（点 chip 左侧圆点或 × 精确定位）→ 读结果
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 1800;
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
  await sleep(1100);
};
const type = async (text) => {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: '', windowsVirtualKeyCode: 0, text: ch, unmodifiedText: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: '', windowsVirtualKeyCode: 0 });
    await sleep(90);
  }
  await sleep(1600);
};
const readAll = () => ev(`(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 205 && r.x <= 995 && r.y >= 85 && r.y <= 560 && r.width > 0 && e.children.length === 0 && (e.textContent||'').trim().length > 0;
  });
  const seen = new Set();
  for (const e of all) {
    const txt = (e.textContent||'').trim();
    if (seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ y: Math.round(r.y), x: Math.round(r.x), t: txt.slice(0, 32) });
  }
  return out.sort((a,b) => a.y - b.y || a.x - b.x).slice(0, 35);
})()`);

// 开搜索 + 输入
await click(1170, 33);
await sleep(700);
await type('配置');
console.log('输入后:', JSON.stringify(await readAll(), null, 1).slice(0, 900));

// chip 定位（DOM 读，不猜坐标）：找含「学习进度」且是 chip 样式（蓝色 bg）的按钮
const chip = await ev(`(() => {
  const els = [...document.querySelectorAll('button, div[role=button], span')].filter(e => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.y >= 130 && r.y <= 160 && (e.textContent||'').includes('学习进度') && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
  });
  return els.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), tag: e.tagName, bg: getComputedStyle(e).backgroundColor.slice(0, 30) }; });
})()`);
console.log('chip:', JSON.stringify(chip, null, 1));

if (Array.isArray(chip) && chip.length) {
  const c = chip[chip.length - 1];
  // chip 内部的 × 在右缘
  await click(c.x + c.w - 10, c.y + c.h / 2);
  await sleep(1200);
  await shot('E:/VBcoding/bijiapp/ops/观测/windows/55-搜索-全局结果.png');
  console.log('全局结果:', JSON.stringify(await readAll(), null, 1).slice(0, 2500));
  await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/55-搜索结果.json', JSON.stringify(await readAll(), null, 1));
}

// Escape 关闭
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
ws.close();
process.exit(0);
