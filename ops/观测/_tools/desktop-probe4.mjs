/**
 * 桌面端探针 v4：模块 3 补测——页签栏（TabBar）与窗口控制（标题栏）
 * 用法: node desktop-probe4.mjs ../windows/28
 * 纪律：只观测、只读 DOM/截图；不动用户页面内容（不点删除类控件）。
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p4';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => (t.url || '').includes('flowus')) || list[0];
console.log('target:', target.url.slice(0, 60), '|', target.title);

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (ev) => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data.toString() : ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
await new Promise((r) => { ws.onopen = r; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result.value;
};
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(`${prefix}-${name}.png`, Buffer.from(r.data, 'base64')); return `${prefix}-${name}.png`; };

// 1. 整屏截图（当前态：页面视图 + 页签栏 + 标题栏）
console.log(await shot('01-整屏当前态'));

// 2. DOM 度量：页签栏区域 + 窗口控制按钮
const metric = await evalJs(`(() => {
  const out = { viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, tabs: [], titlebar: null };
  // 找页签容器：尝试常见类名/角色
  const q = (sel) => document.querySelector(sel);
  // 通用扫描：顶部 0~60px 区域内的可见元素树
  const topEls = [...document.elementsFromPoint(innerWidth/2, 8), ...document.elementsFromPoint(innerWidth/2, 20), ...document.elementsFromPoint(innerWidth/2, 35)];
  const seen = new Set();
  out.topStrip = topEls.filter(e => e && !seen.has(e.tagName + '.' + e.className)).slice(0, 12).map(e => {
    seen.add(e.tagName + '.' + e.className);
    const r = e.getBoundingClientRect();
    return { tag: e.tagName, cls: String(e.className).slice(0, 60), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, text: (e.textContent || '').trim().slice(0, 30) };
  });
  return out;
})()`);
await writeFile(`${prefix}-metrics.json`, JSON.stringify(metric, null, 1));
console.log('metrics saved; topStrip:', metric.topStrip?.length);

ws.close();
process.exit(0);
