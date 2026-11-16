/**
 * 桌面客户端（Electron webview）逐屏探针：量尺寸 + 抓截图 + 抄菜单项
 * 用法: node desktop-probe.mjs <输出前缀，例如 ../windows/10>
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/probe';

const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus'))
  || list.find((t) => t.type === 'page' && (t.url || '').includes('flowus'))
  || list[0];

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
};
await new Promise((r) => { ws.onopen = r; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${prefix}-${name}.png`, Buffer.from(r.data, 'base64'));
  return `${prefix}-${name}.png`;
};
const mouseMove = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => {
  await mouseMove(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(600);
};
const esc = async () => {
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  }
  await sleep(400);
};

const report = { target: { url: target.url, title: target.title, type: target.type } };

// 1) 页面视图基础度量
report.page = await evalJs(`(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const cs = (el) => getComputedStyle(el);
  const out = { viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, title: document.title };
  // 侧栏
  const aside = document.querySelector('aside, [class*="aside"]');
  if (aside) { out.aside = { ...r(aside), bg: cs(aside).backgroundColor }; }
  // 页面标题（第一个大字号可编辑块）
  const h1 = document.querySelector('[data-block-id] h1, h1[contenteditable], .notion-page-title, [class*="title"] h1');
  if (h1) { out.pageTitle = { ...r(h1), fs: cs(h1).fontSize, fw: cs(h1).fontWeight, color: cs(h1).color, text: (h1.textContent || '').slice(0, 20) }; }
  // 前 6 个块
  out.blocks = [...document.querySelectorAll('[data-block-id]')].slice(0, 6).map((el) => ({ id: el.getAttribute('data-block-id'), ...r(el), fs: cs(el).fontSize, text: (el.textContent || '').trim().slice(0, 24) }));
  // 顶栏按钮
  out.topButtons = [...document.querySelectorAll('[aria-label], button')].filter((el) => { const b = el.getBoundingClientRect(); return b.top < 60 && b.width > 10; })
    .map((el) => ({ aria: el.getAttribute('aria-label') || '', ...r(el) })).slice(0, 12);
  return out;
})()`);
report.shot1 = await shot('01-页面视图');

// 2) 块手柄（把鼠标移到第一个块左侧）
const firstBlock = report.page.blocks && report.page.blocks[0];
if (firstBlock) {
  await mouseMove(Math.max(firstBlock.x - 14, 4), firstBlock.y + 14);
  await sleep(700);
  report.handles = await evalJs(`(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const cand = [...document.querySelectorAll('[class*="drag"], [class*="handle"], [class*="gutter"] button')]
      .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 6 && b.width < 60 && b.left < 420; })
      .map((el) => ({ cls: String(el.className).slice(0, 50), aria: el.getAttribute('aria-label') || '', ...r(el) }));
    return cand.slice(0, 10);
  })()`);
  report.shot2 = await shot('02-块手柄');
}

// 3) 块菜单：点第一个块的 ⋮⋮
const handle = (report.handles || []).find((h) => h.w > 6) || (report.handles || [])[0];
if (handle) {
  await click(handle.x + handle.w / 2, handle.y + handle.h / 2);
  report.blockMenuShot = await shot('03-块菜单');
  report.blockMenuItems = await evalJs(`(() => {
    const dialogs = [...document.querySelectorAll('[role="menu"], [class*="menu"], [class*="dropdown"], [class*="popover"]')]
      .filter((d) => { const b = d.getBoundingClientRect(); return b.width > 100 && b.height > 60; });
    const box = dialogs[dialogs.length - 1];
    if (!box) return { found: false };
    const b = box.getBoundingClientRect();
    const items = [...box.querySelectorAll('*')].filter((el) => el.childElementCount === 0 && (el.textContent || '').trim())
      .map((el) => { const rr = el.getBoundingClientRect(); return { txt: (el.textContent || '').trim().slice(0, 18), x: Math.round(rr.x), y: Math.round(rr.y), h: Math.round(rr.height), fs: getComputedStyle(el).fontSize }; });
    return { found: true, box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, items: items.slice(0, 30) };
  })()`);
  await esc();
}

await writeFile(`${prefix}-report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 3000));
ws.close();
