/**
 * 块类型观测 · 步骤 2c：/ 菜单全量清单（滚动读取）
 * 菜单已开（上一脚本遗留）→ 重新开一次，读可见项 → 菜单内滚动 → 再读 → 汇总
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 500;
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
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(700);
};
const wheel = (x, y, dy) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });

// 1. 点正文末块，输入 / 重开菜单
await click(420, 274);
await sleep(400);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191, text: '/' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 });
await sleep(1200);

// 2. 定位菜单容器（可滚动列表）——找含「基础块」文本的滚动容器
const menuRect = await ev(`(() => {
  const els = [...document.querySelectorAll('div')].filter(e => /基础块|AI 助手/.test((e.textContent||'')) && e.children.length > 2 && e.getBoundingClientRect().height > 200);
  const e = els[els.length - 1];
  if (!e) return null;
  // 向上找可滚动祖先
  let s = e;
  while (s && s.scrollHeight <= s.clientHeight + 4) s = s.parentElement;
  if (!s) return null;
  const r = s.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), sh: s.scrollHeight, cls: String(s.className).slice(0,40) };
})()`);
console.log('菜单滚动容器:', JSON.stringify(menuRect));

// 3. 读可见项 + 分组标题（含快捷码）
const readVisible = () => ev(`(() => {
  const out = [];
  // 分组标题：字号小灰色；菜单项：名称+快捷码同行
  const all = [...document.querySelectorAll('div,span')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.x >= 360 && r.x <= 660 && r.y >= 290 && r.y <= 620 && r.width > 0 && e.children.length === 0 && (e.textContent||'').trim();
  });
  const seen = new Set();
  for (const e of all) {
    const txt = (e.textContent||'').trim();
    if (seen.has(txt)) continue;
    seen.add(txt);
    const r = e.getBoundingClientRect();
    out.push({ y: Math.round(r.y), x: Math.round(r.x), t: txt.slice(0, 24), h: Math.round(r.height), fs: getComputedStyle(e).fontSize, color: getComputedStyle(e).color });
  }
  return out.sort((a,b) => a.y - b.y || a.x - b.x);
})()`);

const collected = [];
let lastSig = '';
for (let round = 0; round < 10; round++) {
  const items = await readVisible();
  const sig = items.map(i => i.t).join('|');
  if (sig !== lastSig) {
    collected.push({ round, items });
    lastSig = sig;
    console.log(`-- round ${round}: ${items.length} 项 --`);
  }
  if (round === 0) await shot(`E:/VBcoding/bijiapp/ops/观测/windows/37-菜单-${round}.png`);
  // 滚一屏
  await wheel(menuRect.x + menuRect.w / 2, menuRect.y + menuRect.h / 2, 240);
  await sleep(700);
  // 滚到底了吗：比较 scroll
  const sc = await ev(`(() => { const els = [...document.querySelectorAll('div')].filter(e => /基础块/.test(e.textContent||'') && e.scrollHeight > e.clientHeight + 4); const s = els[els.length-1]; return s ? [s.scrollTop, s.scrollHeight, s.clientHeight] : 'closed'; })()`);
  if (sc === 'closed') { console.log('菜单已关'); break; }
  const [st, sh, ch] = sc;
  console.log(`scroll: ${st}/${sh} (client ${ch})`);
  if (st + ch >= sh - 4) {
    const items2 = await readVisible();
    collected.push({ round: round + 1, items: items2, final: true });
    await shot(`E:/VBcoding/bijiapp/ops/观测/windows/37-菜单-final.png`);
    break;
  }
}
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/37-菜单全量.json', JSON.stringify(collected, null, 1));
console.log('全量已存 JSON，轮数:', collected.length);
ws.close();
process.exit(0);
