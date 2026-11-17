/**
 * 块类型观测 · 步骤 2b：桌面 / 菜单（修正版）
 * 正文块定位：contenteditable 中排除标题（y>250 或 class 不含 break-words _1vs7lkh）
 * 输入 "/"：dispatchKeyEvent rawDown + char 而非 insertText
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 400;
const pending = new Map();
const send = (method, params = {}, timeout = 6000) => new Promise((res) => {
  const i = id++;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); res(null); } }, timeout);
});
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const r = pending.get(m.id); pending.delete(m.id); r(m.result); } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (!r) return 'TIMEOUT';
  if (r.exceptionDetails) return 'ERR:' + (r.exceptionDetails.exception?.description || '').slice(0, 150);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r?.data) await writeFile(name, Buffer.from(r.data, 'base64'));
  return name;
};
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y, count = 1) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: count });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: count });
  await sleep(700);
};

// 1. 列出所有 contenteditable（区分标题与正文块）
const eds = await ev(`(() => {
  const els = [...document.querySelectorAll('[contenteditable=true]')];
  return els.map(e => { const r = e.getBoundingClientRect(); return { y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), cls: String(e.className).slice(0, 40), ph: e.getAttribute('data-placeholder') || e.getAttribute('placeholder') || '' }; });
})()`);
console.log('contenteditable 列表:', JSON.stringify(eds, null, 1));
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/37-editables.json', JSON.stringify(eds, null, 1));
if (!eds || eds === 'TIMEOUT' || eds === 'ERR:undefined') { console.log('ABORT'); process.exit(1); }

// 2. 正文 = 非标题（标题 class 含 _1vs7lkh 或 y<200 且 h>40）——取 y 最大者（页面末尾正文块）
const body = eds.filter(e => !/_1vs7lkh/.test(e.cls)).sort((a, b) => b.y - a.y)[0];
console.log('正文块:', JSON.stringify(body));
if (!body) { console.log('ABORT no body'); process.exit(1); }
await click(body.x + 60, body.y + body.h / 2);
await sleep(500);

// 3. 用 keyDown/keyUp + text 输入 "/"
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191, text: '/' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 });
await sleep(1400);
console.log('斜杠菜单截图:', await shot('E:/VBcoding/bijiapp/ops/观测/windows/37-斜杠菜单-桌面.png'));

// 4. 读菜单：这次放宽 portal 检测（含 overflow visible、shadow 容器）
const menu = await ev(`(() => {
  // 富文本编辑器浮层一般在 #root 外的 portal div（z-index 高）
  const portals = [...document.querySelectorAll('body > div, body > div > div')].filter(e => {
    const cs = getComputedStyle(e);
    return cs.position === 'fixed' || cs.zIndex !== 'auto';
  });
  const out = [];
  for (const p of portals) {
    const r = p.getBoundingClientRect();
    if (r.width === 0) continue;
    const items = [...p.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent||'').trim().length > 0 && (e.textContent||'').trim().length < 30);
    const seen = new Set();
    for (const e of items) {
      const txt = (e.textContent||'').trim();
      if (seen.has(txt)) continue;
      seen.add(txt);
      const ir = e.getBoundingClientRect();
      if (ir.width === 0) continue;
      out.push({ y: Math.round(ir.y), x: Math.round(ir.x), w: Math.round(ir.width), h: Math.round(ir.height), t: txt.slice(0, 22) });
    }
  }
  return out.sort((a,b) => a.y - b.y || a.x - b.x).slice(0, 80);
})()`);
console.log('菜单内容:', JSON.stringify(menu, null, 1).slice(0, 5000));
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/37-斜杠菜单清单.json', JSON.stringify(menu, null, 1));

// 5. Escape
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(500);
ws.close();
process.exit(0);
