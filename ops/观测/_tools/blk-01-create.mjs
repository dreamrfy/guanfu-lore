/**
 * 块类型观测 · 步骤 1：新建观测页（侧栏「私人」组头右侧 ＋）
 * 流程：点私人组「＋」→ 输入页面名「块类型观测-临时」→ 回车
 * 现场承诺：测完由 blk-99-cleanup.mjs 删除（核对名称后）。
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 100;
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
  if (r.exceptionDetails) return 'ERR:' + (r.exceptionDetails.exception?.description || '').slice(0, 120);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r?.data) await writeFile(name, Buffer.from(r.data, 'base64'));
};
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(900);
};
const key = async (k, code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  await sleep(300);
};

// 「私人」组头右侧第 2 个按钮 = 新建（20×20 @187,264，实测 diag-rows）
const plus = await ev(`(() => {
  const btns = [...document.querySelectorAll('button')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 180 && r.x <= 200 && r.y >= 255 && r.y <= 280 && r.width === 20 && r.height === 20;
  });
  const e = btns[btns.length - 1];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
})()`);
console.log('私人组「＋」:', JSON.stringify(plus));
if (!plus || plus === 'TIMEOUT') { console.log('ABORT'); process.exit(1); }
await click(plus.x, plus.y);
await sleep(1200);
console.log('新建页截图:', await shot('E:/VBcoding/bijiapp/ops/观测/windows/36-新建观测页-01.png'));

// 输入页面名
await send('Input.insertText', { text: '块类型观测-临时' });
await sleep(600);
await key('Enter', 'Enter', 13);
await sleep(1500);
console.log('命名后截图:', await shot('E:/VBcoding/bijiapp/ops/观测/windows/36-新建观测页-02.png'));
console.log('URL:', await ev('location.href.slice(0, 90)'));
console.log('TITLE:', await ev('document.title.slice(0, 20)'));
ws.close();
process.exit(0);
