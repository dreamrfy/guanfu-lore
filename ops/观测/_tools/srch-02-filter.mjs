/**
 * 搜索观测 · 步骤 2：搜索交互（输入过滤 / 对话页签 / 只搜索标题）
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 1600;
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
  if (r.exceptionDetails) return 'ERR:' + (r.exceptionDetails.exception?.description || '').slice(0, 160);
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
  await sleep(1000);
};
const type = async (text) => {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: '', windowsVirtualKeyCode: 0, text: ch, unmodifiedText: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: '', windowsVirtualKeyCode: 0 });
    await sleep(90);
  }
  await sleep(1200);
};
const esc = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(500);
};
const readResults = () => ev(`(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 210 && r.x <= 990 && r.y >= 90 && r.y <= 520 && r.width > 0 && e.children.length === 0 && (e.textContent||'').trim().length > 0;
  });
  const seen = new Set();
  for (const e of all) {
    const txt = (e.textContent||'').trim();
    if (seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ y: Math.round(r.y), x: Math.round(r.x), t: txt.slice(0, 30) });
  }
  return out.sort((a,b) => a.y - b.y || a.x - b.x).slice(0, 30);
})()`);

// 1. 打开搜索
await click(1170, 33);
await sleep(600);

// 2. 输入「配置」
console.log('== 输入 配置 ==');
await type('配置');
await shot('E:/VBcoding/bijiapp/ops/观测/windows/52-搜索-输入配置.png');
console.log(JSON.stringify(await readResults(), null, 1).slice(0, 2000));

// 3. 只搜索标题开关
console.log('== 点 只搜索标题 ==');
await click(435, 134);
await sleep(800);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/53-搜索-只搜标题.png');
console.log(JSON.stringify(await readResults(), null, 1).slice(0, 1500));
await click(435, 134); // 关回去
await sleep(500);

// 4. 对话页签
console.log('== 点 对话页签 ==');
await click(281, 143);
await sleep(1000);
await shot('E:/VBcoding/bijiapp/ops/观测/windows/54-搜索-对话页签.png');
console.log(JSON.stringify(await readResults(), null, 1).slice(0, 1200));
await esc();

ws.close();
process.exit(0);
