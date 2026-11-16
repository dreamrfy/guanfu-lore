/**
 * 桌面端探针 v2：内容块手柄 / 块菜单 / 斜杠菜单 / 顶栏按钮 / 页尾引用区
 * 用法: node desktop-probe2.mjs <输出前缀>
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p2';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus')) || list[0];

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (ev) => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
await new Promise((r) => { ws.onopen = r; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 200)); return r.result.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(`${prefix}-${name}.png`, Buffer.from(r.data, 'base64')); return `${prefix}-${name}.png`; };
const mouseMove = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => { await mouseMove(x, y); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(700); };
const key = async (k, code, vk, text) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(300); };
const esc = () => key('Escape', 'Escape', 27);

const report = {};
const safe = async (name, fn) => { try { report[name] = await fn(); } catch (e) { report[name] = { error: String(e).slice(0, 200) }; } };

// 内容区块（x>300，避开侧栏的 data-block-id）
safe('contentBlocks', () => evalJs(`(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return [...document.querySelectorAll('[data-block-id]')]
    .filter((el) => el.getBoundingClientRect().x > 300)
    .map((el) => ({ id: el.getAttribute('data-block-id'), ...r(el), fs: getComputedStyle(el).fontSize, text: (el.textContent || '').trim().slice(0, 30) }))
    .slice(0, 8);
})()`));

// 顶栏按钮（webview 内右侧那一行）
safe('topButtons', () => evalJs(`(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return [...document.querySelectorAll('button, [role="button"], a')]
    .filter((el) => { const b = el.getBoundingClientRect(); return b.top < 50 && b.left > 700 && b.width > 10; })
    .map((el) => ({ aria: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '', cls: String(el.className).slice(0, 40), ...r(el) }))
    .slice(0, 12);
})()`));

// 页尾引用区
safe('references', () => evalJs(`(() => {
  const el = [...document.querySelectorAll('div,span')].find((d) => (d.textContent || '').includes('引用当前页面') && d.childElementCount < 8);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), text: (el.textContent || '').trim().slice(0, 60) };
})()`));

// 第一个内容块左侧 gutter：移入鼠标 → 找手柄
const b0 = (report.contentBlocks || [])[0];
if (b0) {
  await mouseMove(b0.x - 16, b0.y + 16);
  await sleep(900);
  safe('gutterHandles', () => evalJs(`(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return [...document.querySelectorAll('*')]
      .filter((el) => { const b = el.getBoundingClientRect(); return b.width >= 6 && b.width <= 40 && b.height >= 10 && b.height <= 40 && b.left >= 300 && b.left <= b0x; })
      .map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 46), aria: el.getAttribute('aria-label') || '', ...r(el) }))
      .slice(0, 12);
  })()`.replace('b0x', String(Math.round(b0.x) + 40))));
  report.gutterShot = await shot('01-块手柄');
}

// 点第一个手柄 → 块菜单
const handle = (report.gutterHandles || []).find((h) => h.w >= 10);
if (handle && !handle.error) {
  await click(handle.x + handle.w / 2, handle.y + handle.h / 2);
  report.blockMenuShot = await shot('02-块菜单');
  safe('blockMenu', () => evalJs(`(() => {
    const boxes = [...document.querySelectorAll('[role="menu"],[class*="menu"],[class*="dropdown"],[class*="popover"],[class*="tooltip"]')]
      .filter((d) => { const b = d.getBoundingClientRect(); return b.width > 120 && b.height > 40; });
    const box = boxes[boxes.length - 1];
    if (!box) return { found: false };
    const b = box.getBoundingClientRect();
    const items = [...box.querySelectorAll('*')].filter((el) => el.childElementCount <= 1 && (el.textContent || '').trim())
      .map((el) => { const rr = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim().slice(0, 18), ...( { x: Math.round(rr.x), y: Math.round(rr.y), h: Math.round(rr.height) } ), fs: getComputedStyle(el).fontSize }; });
    return { found: true, box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, items: items.slice(0, 30) };
  })()`));
  await esc();
}

// 斜杠菜单：点进第一个内容块末尾 → 回车 → 输入 /
if (b0) {
  await click(b0.x + 20, b0.y + 16);
  await key('End', 'End', 35);
  await key('Enter', 'Enter', 13, '\r');
  await send('Input.insertText', { text: '/' });
  await sleep(1200);
  report.slashShot = await shot('03-斜杠菜单');
  safe('slashMenu', () => evalJs(`(() => {
    const boxes = [...document.querySelectorAll('div')].filter((d) => { const t = d.textContent || ''; const b = d.getBoundingClientRect(); return t.includes('标题') && t.includes('待办') && b.width > 120 && b.width < 480 && b.height > 100; });
    const box = boxes.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    if (!box) return { found: false };
    const b = box.getBoundingClientRect();
    const items = [...box.querySelectorAll('*')].filter((el) => el.childElementCount === 0 && (el.textContent || '').trim())
      .map((el) => { const rr = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim().slice(0, 16), x: Math.round(rr.x), y: Math.round(rr.y), fs: getComputedStyle(el).fontSize, color: getComputedStyle(el).color }; });
    return { found: true, box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, count: items.length, items: items.slice(0, 40) };
  })()`));
  safe('slashSearchBox', () => evalJs(`(() => {
    const el = [...document.querySelectorAll('input, [contenteditable]')].find((d) => (d.getAttribute('placeholder') || '').includes('搜索') || (d.textContent || '').includes('搜索块'));
    if (!el) return null; const b = el.getBoundingClientRect();
    return { ph: el.getAttribute('placeholder') || '', x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  })()`));
  await esc();
}

await writeFile(`${prefix}-report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report).slice(0, 2500));
ws.close();
