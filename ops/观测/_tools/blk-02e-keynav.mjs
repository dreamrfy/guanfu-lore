/**
 * 块类型观测 · 步骤 2e：/ 菜单全量——键盘 ↓ 导航 + 读高亮项
 * 虚拟滚动下键盘是唯一可靠遍历方式。
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 700;
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
};
const arrow = async (key, code, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(260);
};
const readMenu = () => ev(`(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 360 && r.x <= 680 && r.y >= 290 && r.y <= 620 && r.width > 0 && e.children.length === 0 && (e.textContent||'').trim();
  });
  const seen = new Set();
  for (const e of all) {
    const txt = (e.textContent||'').trim();
    if (seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ y: Math.round(r.y), t: txt.slice(0, 24), cls: String(e.className).slice(0, 30) });
  }
  // 找高亮项（背景色明显深/不同的行）
  const hl = [...document.querySelectorAll('div')].filter(e => {
    const r = e.getBoundingClientRect();
    if (r.x < 360 || r.x > 680 || r.y < 290 || r.y > 620) return false;
    const cs = getComputedStyle(e);
    return cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && r.height >= 28 && r.height <= 44 && (e.textContent||'').trim();
  }).map(e => { const r = e.getBoundingClientRect(); return { y: Math.round(r.y), t: (e.textContent||'').trim().slice(0, 30), bg: getComputedStyle(e).backgroundColor }; });
  return { items: out.sort((a,b) => a.y - b.y), highlighted: hl.slice(0, 3) };
})()`);

// 菜单确认开着
const open = await ev(`!![...document.querySelectorAll('div')].find(e => /基础块/.test(e.textContent||'') && e.scrollHeight > 400)`);
console.log('菜单开着:', open);
if (!open) { console.log('ABORT: 菜单未开，先跑 blk-02b'); process.exit(1); }

const seen = new Map();
const order = [];
let dupStreak = 0;
for (let step = 0; step < 200; step++) {
  const st = await readMenu();
  if (st === 'TIMEOUT' || typeof st === 'string') { console.log('读菜单失败', st); break; }
  // 记录当前所有可见项（分组标题 + 项目）
  for (const it of st.items) {
    if (!seen.has(it.t)) { seen.set(it.t, it); order.push(it); }
  }
  // 高亮项单独标记
  const hl = st.highlighted?.[0];
  if (hl) {
    const key = 'HL:' + hl.t;
    if (!seen.has(key)) { seen.set(key, { ...hl, hl: true }); order.push(seen.get(key)); }
  }
  if (step % 20 === 0) await shot(`E:/VBcoding/bijiapp/ops/观测/windows/37-键盘导航-${step}.png`);
  await arrow('ArrowDown', 'ArrowDown', 40);
  // 连续 40 步没有新项 = 到底
  const before = seen.size;
  // noop
  if (seen.size === before && step > 60 && st.items.length < 25) dupStreak++;
  if (dupStreak > 30) { console.log('到底判定'); break; }
}
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/37-菜单全量-键盘法.json', JSON.stringify(order, null, 1));
console.log('=== 遍历完成，唯一条目:', order.length, '===');
console.log(order.map(o => (o.hl ? '★' : ' ') + o.t).join('\n'));
ws.close();
process.exit(0);
