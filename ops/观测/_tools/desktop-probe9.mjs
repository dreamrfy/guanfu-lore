/**
 * 桌面端探针 v9：模块 4——「最近」入口精确定位 + 最近浏览页实测
 * 相比 v8 修正：图标行按钮按 y 排序后取全部 5 个，逐个 hover 读 title 再点；
 * 主页钮 v8 已实测（点击后主区无变化 → 主页=最近浏览的另一种呈现，待本轮核实）。
 * 纪律：只观测；Escape 关浮层。
 * 用法: node desktop-probe9.mjs ../windows/34
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p9';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus'));
if (!target) { console.log('webview-not-found'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (ev) => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data.toString() : ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
await new Promise((r) => { ws.onopen = r; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 250));
  return r.result.value;
};
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(`${prefix}-${name}.png`, Buffer.from(r.data, 'base64')); return `${prefix}-${name}.png`; };
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(1500);
};
const esc = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(500);
};

// ---------- A. 枚举侧栏图标行的 5 个按钮（含 title）----------
const icons = await evalJs(`(() => {
  // 图标行 y 40~110，x<230；叶子级可点容器
  const els = [...document.querySelectorAll('div,button,a')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.y >= 40 && r.y <= 110 && r.width >= 22 && r.width <= 45 && r.height >= 22 && r.height <= 45 && r.x >= 0 && r.x < 230 && e.children.length <= 3;
  });
  const seen = new Map();
  for (const e of els) {
    const r = e.getBoundingClientRect();
    const key = Math.round(r.x);
    if (!seen.has(key) || seen.get(key).depth > 0) seen.set(key, { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], title: e.getAttribute('title') || e.getAttribute('aria-label') || '' });
  }
  return [...seen.entries()].sort((a,b) => a[0]-b[0]).map(([k,v]) => v);
})()`);
console.log('A. 图标行按钮:', JSON.stringify(icons, null, 1));
await writeFile(`${prefix}-sidebar-icons.json`, JSON.stringify(icons, null, 1));

// ---------- B. hover 第 2 个（最近）确认 title，再点击 ----------
const recent = icons[1];
if (!recent) { console.log('B. 没找到第二个图标'); ws.close(); process.exit(1); }
await move(recent.x, recent.y);
await sleep(600);
const hoverTitle = await evalJs(`(() => {
  const tips = [...document.querySelectorAll('[role=tooltip], .tooltip, [class*=tooltip]')].filter(e => e.getBoundingClientRect().width > 0);
  return tips.map(e => (e.textContent || '').trim().slice(0, 20));
})()`);
console.log('B. hover 提示:', JSON.stringify(hoverTitle));
await click(recent.x, recent.y);
console.log('B1. 点击「最近」后截图:', await shot('01-最近浏览页'));
await sleep(800);

// ---------- C. 最近页 DOM 解剖 ----------
const struct = await evalJs(`(() => {
  const dump = (el, d, maxd) => {
    if (!el || d > maxd) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && d > 2) return null;
    const n = { tag: el.tagName, cls: String(el.className||'').slice(0,55), rect: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)] };
    if (!el.children.length) { const t = (el.textContent||'').trim(); if (t) n.text = t.slice(0,50); }
    if (el.children.length && d < maxd) n.ch = [...el.children].slice(0,12).map(c => dump(c, d+1, maxd)).filter(Boolean);
    return n;
  };
  // 主体 = 顶栏(y<50) 以下 + 侧栏(x>230) 右侧区域
  const bodyArea = [...document.querySelectorAll('div')].find(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 228 && r.y <= 50 && r.width > 500 && /main-panel|relative/.test(String(e.className));
  });
  return dump(bodyArea || document.body, 0, 6);
})()`);
await writeFile(`${prefix}-recent-structure.json`, JSON.stringify(struct, null, 1));
console.log('C. 结构已存 recent-structure.json, node 数:', JSON.stringify(struct).length);

// ---------- D. URL 变化记录 ----------
console.log('D. 当前 URL:', (await evalJs('location.href.slice(0,90)')));

ws.close();
process.exit(0);
