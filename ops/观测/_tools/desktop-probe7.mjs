/**
 * 桌面端探针 v7：页签栏补测——settings 按钮 / 多页签宽度行为 / webview 对应 / 中键关闭
 * 用法: node desktop-probe7.mjs ../windows/32
 * 纪律：本脚本开的页签全部自己关（标题核对后才关）；Escape 关菜单。
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p7';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && (t.url || '').startsWith('file://'));
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
const click = async (x, y, button = 'left') => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
  await sleep(900);
};
const esc = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(400);
};
const tabState = () => evalJs(`(() => {
  const tabs = [...document.querySelectorAll('.modern-tab')].map(e => { const r = e.getBoundingClientRect(); return { title: (e.querySelector('.tab-title')?.textContent || '').trim(), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], active: /active/.test(String(e.className)) }; });
  const wvs = [...document.querySelectorAll('webview')].map(w => ({ src: (w.src || '').slice(0, 70), cls: String(w.className).slice(0, 40), visible: w.getBoundingClientRect().width > 0 }));
  return { tabCount: tabs.length, tabs, webviews: wvs, wrapperCount: document.querySelectorAll('.webview-wrapper').length };
})()`);

// ---------- A. settings-btn（页签栏右侧 ⋯）----------
const sb = await evalJs(`(() => { const b = document.querySelector('.settings-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)]; })()`);
if (sb) {
  await click(sb[0], sb[1]);
  console.log('A. settings 菜单截图:', await shot('01-页签栏设置菜单'));
  const items = await evalJs(`(() => {
    const els = [...document.querySelectorAll('[role=menuitem], [data-radix-popper-content-wrapper] *, [class*=dropdown] [role=menuitem]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.width < 500; });
    const uniq = new Map();
    for (const e of els) { const t = (e.textContent || '').trim(); if (t && t.length < 40 && !uniq.has(t)) { const r = e.getBoundingClientRect(); uniq.set(t, [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]); } }
    return [...uniq.entries()].map(([text, rect]) => ({ text, rect }));
  })()`);
  console.log('A. 菜单项:', JSON.stringify(items, null, 1));
  await writeFile(`${prefix}-settings-menu.json`, JSON.stringify(items, null, 1));
  await esc();
}

// ---------- B. 多页签：宽度挤压行为 ----------
const newBtn = await evalJs(`(() => { const b = document.querySelector('.new-tab-btn'); const r = b.getBoundingClientRect(); return [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)]; })()`);
for (let i = 0; i < 3; i++) { await click(newBtn[0], newBtn[1]); await sleep(600); }
console.log('B. 开到 4 个页签后:', await shot('02-四页签宽度'));
const s4 = await tabState();
console.log('B. 状态:', JSON.stringify(s4, null, 1));
await writeFile(`${prefix}-four-tabs.json`, JSON.stringify(s4, null, 1));

// ---------- C. 中键关闭最后一个页签 ----------
const last = s4.tabs[s4.tabs.length - 1];
await click(last.rect[0] + last.rect[2] / 2, last.rect[1] + last.rect[3] / 2, 'middle');
const sMid = await tabState();
console.log('C. 中键关闭后页签数:', sMid.tabCount);

// ---------- D. 逐个关闭剩余多余页签（核对标题一致才关）----------
while (true) {
  const st = await tabState();
  if (st.tabCount <= 1) break;
  const info = await evalJs(`(() => {
    const tabs = [...document.querySelectorAll('.modern-tab')];
    const first = tabs[0].querySelector('.tab-title')?.textContent?.trim();
    const lastEl = tabs[tabs.length - 1];
    const lastTitle = lastEl.querySelector('.tab-title')?.textContent?.trim();
    const b = lastEl.querySelector('.tab-close-btn');
    if (!b) return { err: 'no-close-btn' };
    const r = b.getBoundingClientRect();
    return { first, lastTitle, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
  })()`);
  if (info.err || info.first !== info.lastTitle) { console.log('D. 核对不通过，停手:', JSON.stringify(info)); break; }
  await click(info.x, info.y);
}
const fin = await tabState();
console.log('D. 清理完成: 页签数 =', fin.tabCount, '标题 =', JSON.stringify(fin.tabs.map(t => t.title)));

ws.close();
process.exit(0);
