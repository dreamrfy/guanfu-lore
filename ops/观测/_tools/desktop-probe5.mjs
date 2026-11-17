/**
 * 桌面端探针 v5：模块 3 补测——外壳层（Electron shell）的页签栏与窗口控制
 * 用法: node desktop-probe5.mjs ../windows/29
 * 纪律：只观测；新开的页签由本脚本自己关闭；不碰删除类控件。
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p5';
const list = await (await fetch(`${BASE}/json/list`)).json();
// 外壳目标 = file:// 协议的 page（webview 是内容页）
const target = list.find((t) => t.type === 'page' && (t.url || '').startsWith('file://'));
if (!target) { console.log('shell-not-found; targets:', list.map(t => t.type + ':' + (t.url||'').slice(0,40)).join('\n')); process.exit(1); }
console.log('shell target:', decodeURIComponent(target.url).slice(0, 80), '|', target.title);

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (ev) => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data.toString() : ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
await new Promise((r) => { ws.onopen = r; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
};
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(`${prefix}-${name}.png`, Buffer.from(r.data, 'base64')); return `${prefix}-${name}.png`; };
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(800);
};
const rclick = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
  await sleep(800);
};
const esc = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(400); };

// 1. 外壳页整体结构
const struct = await evalJs(`(() => {
  const walk = (el, depth, maxDepth) => {
    if (!el || depth > maxDepth) return null;
    const r = el.getBoundingClientRect();
    const node = { tag: el.tagName, id: el.id || undefined, cls: String(el.className||'').slice(0,70), rect: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)] };
    if (el.children.length && depth < maxDepth) node.children = [...el.children].slice(0,20).map(c => walk(c, depth+1, maxDepth)).filter(Boolean);
    else if (!el.children.length) node.text = (el.textContent||'').trim().slice(0,40);
    return node;
  };
  return { viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, body: walk(document.body, 0, 6) };
})()`);
await writeFile(`${prefix}-shell-structure.json`, JSON.stringify(struct, null, 1));
console.log('shell viewport:', JSON.stringify(struct.viewport), 'structure saved');

// 2. 找页签栏：搜含 tab/close/拖拽 语义的元素
const tabs = await evalJs(`(() => {
  const all = [...document.querySelectorAll('*')];
  const hits = all.filter(e => {
    const c = String(e.className||'') + ' ' + (e.id||'');
    return /tab|dragg|titlebar|window-control|caption/i.test(c) && e.getBoundingClientRect().width > 0;
  }).slice(0, 40);
  return hits.map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, id: e.id||undefined, cls: String(e.className).slice(0,80), rect: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)], text: (e.textContent||'').trim().slice(0,30), title: e.getAttribute('title')||undefined }; });
})()`);
await writeFile(`${prefix}-tab-elements.json`, JSON.stringify(tabs, null, 1));
console.log('tab-ish elements:', tabs.length);
console.log(JSON.stringify(tabs.slice(0, 12), null, 1));

ws.close();
process.exit(0);
