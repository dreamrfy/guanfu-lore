/**
 * 搜索观测 · 步骤 5：稳健版——每步验证，Ctrl+P 或点击开面板，焦点确认后再输入
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 1900;
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
  await sleep(1600);
};

// 面板检测：输入框 placeholder「在页面中搜索」是否可见
const panelOpen = () => ev(`!![...document.querySelectorAll('input')].find(e => /在页面中搜索/.test(e.placeholder || '') && e.getBoundingClientRect().width > 0)`);

// 1. 开面板（顶栏放大镜）
await click(1170, 33);
let open = await panelOpen();
console.log('面板打开:', open);
if (!open) { console.log('ABORT'); process.exit(1); }

// 2. 焦点确认 + 输入「配置」
const focusInfo = await ev(`(() => { const e = document.activeElement; return e ? e.tagName + ':' + (e.placeholder || '').slice(0, 12) : 'none'; })()`);
console.log('焦点:', focusInfo);
await type('配置');
open = await panelOpen();
console.log('输入后面板仍在:', open);
if (!open) { console.log('ABORT: 面板中途关闭'); process.exit(1); }
await shot('E:/VBcoding/bijiapp/ops/观测/windows/52-搜索-输入配置.png');

// 3. DOM 找 chip（含 × 的范围 chip）：从面板容器里找
const chips = await ev(`(() => {
  const input = [...document.querySelectorAll('input')].find(e => /在页面中搜索/.test(e.placeholder || ''));
  if (!input) return null;
  // 向上找面板容器
  let panel = input;
  for (let i = 0; i < 6 && panel.parentElement; i++) panel = panel.parentElement;
  const els = [...panel.querySelectorAll('*')].filter(e => {
    const r = e.getBoundingClientRect();
    return (e.textContent || '').includes('学习进度') && r.width > 40 && r.width < 160 && r.height >= 20 && r.height <= 36;
  });
  return els.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), tag: e.tagName, cls: String(e.className).slice(0, 30) }; });
})()`);
console.log('chip 候选:', JSON.stringify(chips, null, 1));
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/55-chip候选.json', JSON.stringify(chips, null, 1));

// 4. 只搜索标题开关（面板内找文本「只搜索标题」的中心）
const toggle = await ev(`(() => {
  const input = [...document.querySelectorAll('input')].find(e => /在页面中搜索/.test(e.placeholder || ''));
  if (!input) return null;
  let panel = input;
  for (let i = 0; i < 6 && panel.parentElement; i++) panel = panel.parentElement;
  const e = [...panel.querySelectorAll('*')].find(e => (e.textContent||'').trim() === '只搜索标题' && e.children.length === 0);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
})()`);
console.log('只搜索标题:', JSON.stringify(toggle));
if (toggle && toggle !== 'TIMEOUT') {
  await click(toggle.x, toggle.y);
  await sleep(900);
  await shot('E:/VBcoding/bijiapp/ops/观测/windows/53-搜索-只搜标题.png');
  console.log('开关后输入框值:', await ev(`(() => { const i = [...document.querySelectorAll('input')].find(e => /搜索/.test(e.placeholder||'')); return i ? i.value : 'no-input'; })()`));
  // 关回去
  await click(toggle.x, toggle.y);
  await sleep(600);
}

// 5. 清空输入（点 ×）→ 面板默认态
ws.close();
process.exit(0);
