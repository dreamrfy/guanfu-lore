/**
 * 块类型观测 · 步骤 4：代码片段展开态 + 语言选择器
 * 找到代码片段块（▾ 容器）→ 点击展开 → 截图 → 点语言区 → 截图
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 1100;
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
const click = async (x, y, count = 1) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: count });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: count });
  await sleep(900);
};

// 1. 找折叠三角（▾）——代码片段/简单表格容器的展开钮
const tri = await ev(`(() => {
  const els = [...document.querySelectorAll('div,svg')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 356 && r.x <= 380 && r.y > 400 && r.y < 560 && r.width >= 10 && r.width <= 20 && r.height >= 10 && r.height <= 20;
  });
  const e = els[0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), n: els.length };
})()`);
console.log('折叠三角:', JSON.stringify(tri));
if (tri && tri !== 'TIMEOUT') {
  await click(tri.x, tri.y);
  await sleep(1200);
  console.log('展开态截图:', await shot('E:/VBcoding/bijiapp/ops/观测/windows/39-代码片段-展开态.png'));
  // 度量展开后的结构
  const m = await ev(`(() => {
    // 代码块容器：找 pre/code 或语言标签
    const pre = document.querySelector('pre, code');
    const lang = [...document.querySelectorAll('button, div, span')].filter(e => /select|语言|lang/i.test(String(e.className)) && e.getBoundingClientRect().y > 400);
    return { pre: pre ? pre.getBoundingClientRect().width : null, langBtn: lang.slice(0, 3).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), (e.textContent||'').trim().slice(0,15)]; }) };
  })()`);
  console.log('展开度量:', JSON.stringify(m));
} else {
  console.log('三角没找到——改点代码块区域本身');
  await click(500, 470);
  await sleep(1000);
  await shot('E:/VBcoding/bijiapp/ops/观测/windows/39-代码片段-点击态.png');
}
ws.close();
process.exit(0);
