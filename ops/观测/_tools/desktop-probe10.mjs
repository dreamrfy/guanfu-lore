/**
 * 桌面端探针 v10：模块 4——逐个点图标行（笑脸→搜索→通知→⋯），每步短超时、独立输出
 * 已知：图标行 5 钮 @y54 32×32 步长45：主页(8)/笑脸(53)/搜索(98)/通知(142)/更多(187)
 *       主页钮点击后主区无变化（当前即主页态？待核）；钮均无 aria/title 语义。
 * 纪律：只观测；不建页不删页；每步 Escape 收尾。
 * 用法: node desktop-probe10.mjs ../windows/35
 */
import { writeFile } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p10';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus'));

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (ev) => { const m = JSON.parse(typeof ev.data === 'string' ? ev.data.toString() : ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
await new Promise((r) => { ws.onopen = r; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.exceptionDetails) return 'EVAL-ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 120);
  return r.result.value;
};
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(`${prefix}-${name}.png`, Buffer.from(r.data, 'base64')); };
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
  await sleep(600);
};
const state = async (tag) => {
  const url = await evalJs('location.href.slice(0, 95)');
  console.log(`[${tag}] URL: ${url}`);
};

// 主区文本快照（顶栏下 200px 高的可见文本）
const mainText = () => evalJs(`(() => {
  const els = [...document.querySelectorAll('h1,h2,h3,button,span,div')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x > 230 && r.y > 0 && r.y < 300 && r.width > 0 && e.children.length === 0 && (e.textContent||'').trim();
  });
  return els.slice(0, 25).map(e => { const r = e.getBoundingClientRect(); return Math.round(r.x) + ',' + Math.round(r.y) + ' ' + (e.textContent||'').trim().slice(0,25); });
})()`);

// ---- 步骤 1：笑脸 (69,70) ----
console.log('== STEP1 笑脸 ==');
await click(69, 70);
await shot('01-笑脸点击后');
console.log((await mainText()).slice(0, 8));
await state('after-smile');
await esc();

// ---- 步骤 2：通知 (158,70) ----
console.log('== STEP2 通知 ==');
await click(158, 70);
await shot('02-通知点击后');
console.log((await mainText()).slice(0, 8));
await state('after-bell');
await esc();

// ---- 步骤 3：⋯ (203,70) ----
console.log('== STEP3 更多 ==');
await click(203, 70);
await shot('03-更多点击后');
console.log((await mainText()).slice(0, 8));
await state('after-dots');
await esc();

// ---- 步骤 4：主页 (24,70)——从笑脸页离开后回主页，看主页态长啥样 ----
console.log('== STEP4 主页 ==');
await click(24, 70);
await shot('04-主页点击后');
console.log((await mainText()).slice(0, 10));
await state('after-home');

ws.close();
process.exit(0);
