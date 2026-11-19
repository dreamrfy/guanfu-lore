/**
 * 模块7事故清理：右键「网页剪藏」表 No.2 空记录（17:58 误建）→ 读菜单 → 点删除 → 核对
 * 红线④：删除前核对目标 = No.2 行、标题空、创建时间 2026/11/17 17:58
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
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); res(null); } }, timeout);
});
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// No.2 行标题单元格右键
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 606 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 606, button: 'right', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 606, button: 'right', clickCount: 1 });
await sleep(900);

// 读右键菜单项（含坐标）
const menu = await send('Runtime.evaluate', { expression: `(() => {
  const items = [...document.querySelectorAll('[role=menuitem], [role=option]')].map(el => {
    const r = el.getBoundingClientRect();
    return { text: (el.textContent || '').trim().slice(0, 20), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width) };
  }).filter(i => i.w > 0);
  return JSON.stringify(items);
})()`, returnByValue: true });
console.log('MENU:', menu?.result?.value);
if (menu?.result?.value) await writeFile('E:/VBcoding/bijiapp/ops/tmp/_rowmenu.json', menu.result.value);

process.exit(0);
