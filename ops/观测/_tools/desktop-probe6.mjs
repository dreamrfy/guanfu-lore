/**
 * 桌面端探针 v6：外壳层 left-controls 明细 + 页签交互（新建/多页签/关闭/右键菜单）
 * 用法: node desktop-probe6.mjs ../windows/30
 * 纪律：本脚本新建的页签自己关掉；只观察，不碰删除类控件。
 */
import { writeFile } from 'node:fs/promises';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const prefix = process.argv[2] || '../windows/p6';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && (t.url || '').startsWith('file://'));
if (!target) { console.log('shell-not-found'); process.exit(1); }

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
const click = async (x, y, opts = {}) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: opts.right ? 'right' : 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: opts.right ? 'right' : 'left', clickCount: 1 });
  await sleep(900);
};

// ---------- A. left-controls 明细 ----------
const lc = await evalJs(`(() => {
  const lc = document.querySelector('.left-controls');
  if (!lc) return null;
  const dump = (el, d) => {
    const r = el.getBoundingClientRect();
    const n = { tag: el.tagName, cls: String(el.className || '').slice(0, 50), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    if (el.title) n.title = el.title;
    if (!el.children.length) n.text = (el.textContent || '').trim().slice(0, 40);
    if (d < 4) n.ch = [...el.children].map((c) => dump(c, d + 1));
    return n;
  };
  return dump(lc, 0);
})()`);
await writeFile(`${prefix}-left-controls.json`, JSON.stringify(lc, null, 1));
console.log('A. left-controls:', JSON.stringify(lc).slice(0, 400));

// ---------- B. 页签右键菜单 ----------
await click(320, 19, { right: true });
console.log('B. 右键菜单截图:', await shot('01-页签右键菜单'));
const menu = await evalJs(`(() => {
  const items = [...document.querySelectorAll('[role=menuitem], .context-menu-item, .menu-item, [class*=menu] button, [class*=Menu] div[class*=item]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.width < 400 && r.y >= 0 && r.y < 300; })
    .slice(0, 20);
  return items.map(e => { const r = e.getBoundingClientRect(); return { text: (e.textContent || '').trim().slice(0, 30), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }; });
})()`);
console.log('菜单项:', JSON.stringify(menu, null, 1));
await writeFile(`${prefix}-tab-context-menu.json`, JSON.stringify(menu, null, 1));
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(500);

// ---------- C. 新建页签（点 new-tab-btn）→ 观察默认页 ----------
const newBtn = await evalJs(`(() => { const b = document.querySelector('.new-tab-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)]; })()`);
if (newBtn) {
  await click(newBtn[0], newBtn[1]);
  await sleep(1500);
  console.log('C. 新建页签后:', await shot('02-新建页签默认页'));
  const state = await evalJs(`(() => {
    const tabs = [...document.querySelectorAll('.modern-tab')].map(e => { const r = e.getBoundingClientRect(); return { title: (e.querySelector('.tab-title')?.textContent || '').trim(), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], active: /active/.test(String(e.className)) }; });
    return { tabCount: tabs.length, tabs };
  })()`);
  console.log('页签状态:', JSON.stringify(state, null, 1));
  await writeFile(`${prefix}-after-new-tab.json`, JSON.stringify(state, null, 1));

  // ---------- D. 关掉自己开的页签（点它的 close 按钮）----------
  const closeBtn = await evalJs(`(() => {
    const tabs = [...document.querySelectorAll('.modern-tab')];
    const t = tabs[tabs.length - 1];
    const b = t && t.querySelector('.tab-close-btn');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
  })()`);
  if (closeBtn) { await click(closeBtn[0], closeBtn[1]); await sleep(1000); }
  const after = await evalJs(`document.querySelectorAll('.modern-tab').length`);
  console.log('D. 关闭后页签数:', after);
  console.log('D. 关闭后截图:', await shot('03-关闭页签后'));
}

ws.close();
process.exit(0);
