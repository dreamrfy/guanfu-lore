/**
 * 桌面端探针 v8：模块 4——主页（Home）与最近浏览
 * 入口：页签栏左侧导航区的主页钮（.home-btn）→ 观察主页形态；
 *       图标行「最近」→ 最近浏览页。
 * 纪律：只观测；不新建/删除任何页面；Escape 关浮层。
 * 用法: node desktop-probe8.mjs ../windows/33
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p8';
const list = await (await fetch(`${BASE}/json/list`)).json();
// 内容层 = webview 目标（主页是网页 DOM 的一部分）
const target = list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus'));
if (!target) { console.log('webview-not-found'); process.exit(1); }
console.log('content target:', (target.url || '').slice(0, 50), '|', target.title);

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
  await sleep(1200);
};
const esc = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(500);
};

// 工具：在内容层 DOM 里按可见文本找元素中心坐标
const findCenter = async (text) => evalJs(`(() => {
  const t = ${JSON.stringify(text)};
  const els = [...document.querySelectorAll('button, a, [role=button], div, span')].filter(e => {
    const txt = (e.textContent || '').trim();
    if (txt !== t && !txt.startsWith(t)) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.width < 300 && r.height > 0 && r.height < 60 && r.x >= 0 && r.x < 260;
  });
  const e = els[els.length - 1];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { text: (e.textContent||'').trim().slice(0,20), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
})()`);

// ---------- A. 主页（点侧栏图标行第 1 个「主页」）----------
// 模块 1 实测：图标行 5 个 32×32，主页在 x≈27（截图 10-01 中主页图标 @(27,71) 附近）
// 先截图当前态，再点主页
console.log('A0. 当前态:', await shot('00-当前态'));
const homeBtn = await evalJs(`(() => {
  // 主页按钮：侧栏顶部图标行第一个，找 svg 外层可点元素（x<50, y 40~110）
  const els = [...document.querySelectorAll('div,button,a')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 5 && r.x <= 45 && r.y >= 40 && r.y <= 110 && r.width >= 20 && r.width <= 45 && r.height >= 20 && r.height <= 45;
  });
  const e = els[0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], cls: String(e.className).slice(0,50) };
})()`);
console.log('主页钮坐标:', JSON.stringify(homeBtn));
if (homeBtn) {
  await click(homeBtn.x, homeBtn.y);
  await sleep(1500);
  console.log('A1. 主页截图:', await shot('01-主页默认态'));
  const homeStruct = await evalJs(`(() => {
    const main = document.querySelector('main') || document.body;
    const dump = (el, d, maxd) => {
      if (!el || d > maxd) return null;
      const r = el.getBoundingClientRect();
      const n = { tag: el.tagName, cls: String(el.className||'').slice(0,55), rect: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)] };
      if (!el.children.length) { const t = (el.textContent||'').trim(); if (t) n.text = t.slice(0,40); }
      if (el.children.length && d < maxd) n.ch = [...el.children].slice(0,14).map(c => dump(c, d+1, maxd)).filter(Boolean);
      return n;
    };
    return dump(main, 0, 5);
  })()`);
  await writeFile(`${prefix}-home-structure.json`, JSON.stringify(homeStruct, null, 1));
  console.log('A1. 主页结构已存 home-structure.json');
}

// ---------- B. 最近浏览（侧栏图标行第 3 个）----------
const recentBtn = await evalJs(`(() => {
  // 图标行 5 个 32×32：主页/最近/搜索/通知/更多，取第 3 个（搜索前的那个）
  const els = [...document.querySelectorAll('div,button,a')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.y >= 40 && r.y <= 110 && r.width >= 20 && r.width <= 45 && r.height >= 20 && r.height <= 45 && r.x >= 0 && r.x < 230;
  }).sort((a,b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
  const e = els[2]; // 第 3 个 = 最近
  if (!e) return { count: els.length, xs: els.map(x => Math.round(x.getBoundingClientRect().x)) };
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], total: els.length };
})()`);
console.log('最近钮:', JSON.stringify(recentBtn));
if (recentBtn && recentBtn.x !== undefined) {
  await click(recentBtn.x, recentBtn.y);
  await sleep(1500);
  console.log('B1. 最近页截图:', await shot('02-最近浏览页'));
  const recentStruct = await evalJs(`(() => {
    const main = document.querySelector('main') || document.body;
    const dump = (el, d, maxd) => {
      if (!el || d > maxd) return null;
      const r = el.getBoundingClientRect();
      const n = { tag: el.tagName, cls: String(el.className||'').slice(0,55), rect: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)] };
      if (!el.children.length) { const t = (el.textContent||'').trim(); if (t) n.text = t.slice(0,50); }
      if (el.children.length && d < maxd) n.ch = [...el.children].slice(0,14).map(c => dump(c, d+1, maxd)).filter(Boolean);
      return n;
    };
    return dump(main, 0, 5);
  })()`);
  await writeFile(`${prefix}-recent-structure.json`, JSON.stringify(recentStruct, null, 1));
  console.log('B1. 最近页结构已存 recent-structure.json');
} else {
  console.log('B. 最近钮没找到:', JSON.stringify(recentBtn));
}

ws.close();
process.exit(0);
