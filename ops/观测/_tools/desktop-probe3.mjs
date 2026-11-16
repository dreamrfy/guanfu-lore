/**
 * 桌面端探针 v3：块 gutter 手柄 + 块菜单 + / 菜单 + 页面顶栏图标/菜单
 * 用法: node desktop-probe3.mjs ../windows/12
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p3';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => (t.url || '').includes('flowus')) || list[0];

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (ev) => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
await new Promise((r) => { ws.onopen = r; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 160)); return r.result.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(`${prefix}-${name}.png`, Buffer.from(r.data, 'base64')); return `${prefix}-${name}.png`; };
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => { await move(x, y); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(700); };
const esc = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(400); };

const report = {};
const safe = async (k, fn) => { try { report[k] = await fn(); } catch (e) { report[k] = { error: String(e).slice(0, 160) }; } };

// 找内容块
const blocks = await evalJs(`(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return [...document.querySelectorAll('[data-block-id]')].filter((el) => el.getBoundingClientRect().left > 300)
    .map((el) => ({ id: el.getAttribute('data-block-id'), ...r(el), text: (el.textContent || '').trim().slice(0, 20) }));
})()`);
report.blocks = blocks;
const b1 = blocks[1] || blocks[0];

// 悬停 gutter，列出左侧新出现的元素（把手/加号）
await move(b1.x - 20, b1.y + Math.round(b1.h / 2));
await sleep(900);
await safe('gutter', () => evalJs(`(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return [...document.querySelectorAll('div,button,span,svg')]
    .filter((el) => { const b = el.getBoundingClientRect(); return b.width >= 6 && b.width <= 44 && b.height >= 10 && b.height <= 44 && b.left > 290 && b.left < 366; })
    .map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 44), aria: el.getAttribute('aria-label') || '', ...r(el) }))
    .slice(0, 14);
})()`));
report.gutterShot = await shot('01-gutter手柄');

// 点第一个 gutter 元素（拖拽把手）→ 块菜单
const g = (report.gutter || []).find((e) => !e.error && e.w >= 10 && e.h >= 10);
if (g) {
  await click(g.x + Math.round(g.w / 2), g.y + Math.round(g.h / 2));
  report.blockMenuShot = await shot('02-块菜单');
  await safe('blockMenu', () => evalJs(`(() => {
    const boxes = [...document.querySelectorAll('[role="menu"],[class*="menu"],[class*="dropdown"],[class*="popover"]')]
      .filter((d) => { const b = d.getBoundingClientRect(); return b.width > 120 && b.height > 40; });
    const box = boxes[boxes.length - 1]; if (!box) return { found: false };
    const b = box.getBoundingClientRect();
    const items = [...box.querySelectorAll('*')].filter((el) => el.childElementCount <= 1 && (el.textContent || '').trim())
      .map((el) => { const rr = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim().slice(0, 20), y: Math.round(rr.y), h: Math.round(rr.height), fs: getComputedStyle(el).fontSize }; });
    return { found: true, box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, items: items.slice(0, 30) };
  })()`));
  await esc();
}

// 斜杠菜单：点进空块 → 输入 "/"
const empty = blocks[blocks.length - 1];
await click(empty.x + 30, empty.y + 12);
await send('Input.insertText', { text: '/' });
await sleep(1300);
report.slashShot = await shot('03-斜杠菜单');
await safe('slashMenu', () => evalJs(`(() => {
  const boxes = [...document.querySelectorAll('div')].filter((d) => { const t = d.textContent || ''; const b = d.getBoundingClientRect(); return t.includes('待办') && t.includes('引用') && b.width > 120 && b.width < 520 && b.height > 120; });
  const box = boxes.sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
  if (!box) return { found: false };
  const b = box.getBoundingClientRect();
  const items = [...box.querySelectorAll('*')].filter((el) => el.childElementCount === 0 && (el.textContent || '').trim())
    .map((el) => { const rr = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim().slice(0, 18), x: Math.round(rr.x), y: Math.round(rr.y), fs: getComputedStyle(el).fontSize, color: getComputedStyle(el).color }; });
  return { found: true, box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, items: items.slice(0, 40) };
})()`));
await esc();

// 顶栏右侧图标
await safe('topIcons', () => evalJs(`(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return [...document.querySelectorAll('div,button,span,svg')]
    .filter((el) => { const b = el.getBoundingClientRect(); return b.top < 50 && b.left > 300 && b.width >= 14 && b.width <= 44 && b.height >= 14 && b.height <= 40; })
    .map((el) => ({ tag: el.tagName.toLowerCase(), aria: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '', ...r(el) }))
    .slice(0, 16);
})()`));

await writeFile(`${prefix}-report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 4000));
ws.close();
