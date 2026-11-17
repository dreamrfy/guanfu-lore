/**
 * 块类型观测 · 步骤 2：桌面 / 菜单全量类型清单
 * 在观测页正文末行输入 "/" → 读浮层列表（含分组标题）→ Escape
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 200;
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
  return name || 'shot-fail';
};

// 1. 点击正文末尾（页面主体中部空白处）获得焦点
const bodyPos = await ev(`(() => {
  // 编辑器正文区域：找 data-block-id 或 contenteditable
  const ed = document.querySelector('[contenteditable=true]');
  if (!ed) return null;
  const r = ed.getBoundingClientRect();
  return { x: Math.round(r.x + 100), y: Math.round(r.y + r.height - 60), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
})()`);
console.log('编辑器:', JSON.stringify(bodyPos));
if (!bodyPos || bodyPos === 'TIMEOUT') { console.log('ABORT no-editor'); process.exit(1); }

const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(800);
};

await click(bodyPos.x, bodyPos.y);
await sleep(600);

// 2. 键盘输入 "/"（用 insertText 更稳）
await send('Input.insertText', { text: '/' });
await sleep(1200);
console.log('斜杠菜单截图:', await shot('E:/VBcoding/bijiapp/ops/观测/windows/37-斜杠菜单-桌面.png'));

// 3. 读菜单内容（列表项 + 分组标题）
const menu = await ev(`(() => {
  // 浮层通常挂在 body 末尾的 portal；找可见的绝对定位列表
  const cands = [...document.querySelectorAll('div')].filter(e => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return (cs.position === 'fixed' || cs.position === 'absolute') && r.width >= 180 && r.width <= 400 && r.height > 200 && r.x > 200;
  });
  const pick = cands.sort((a,b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
  if (!pick) return 'NO-MENU';
  const items = [...pick.querySelectorAll('*')].filter(e => e.children.length === 0 && (e.textContent||'').trim());
  const seen = new Set(); const out = [];
  for (const e of items) {
    const txt = (e.textContent||'').trim();
    if (!txt || seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), t: txt.slice(0, 25) });
  }
  return out.sort((a,b) => a.y - b.y || a.x - b.x);
})()`);
console.log('菜单内容:', JSON.stringify(menu, null, 1).slice(0, 4000));
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/37-斜杠菜单清单.json', JSON.stringify(menu, null, 1));

// 4. Escape 收起
const esc = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(500);
};
await esc();
ws.close();
process.exit(0);
