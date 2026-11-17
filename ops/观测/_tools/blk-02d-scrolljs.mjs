/**
 * 块类型观测 · 步骤 2d：/ 菜单全量清单——直接 JS 改 scrollTop
 * 前提：菜单还开着（scrollHeight 5013 / client 305）
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 600;
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

// 菜单是否还开着
let menuOpen = await ev(`!![...document.querySelectorAll('div')].find(e => /基础块/.test(e.textContent||'') && e.scrollHeight > 400)`);
console.log('菜单状态:', menuOpen);
if (!menuOpen) {
  // 重开：点正文 + 输入 /
  const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await move(420, 274);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 420, y: 274, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 420, y: 274, button: 'left', clickCount: 1 });
  await sleep(500);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191, text: '/' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 });
  await sleep(1200);
  menuOpen = await ev(`!![...document.querySelectorAll('div')].find(e => /基础块/.test(e.textContent||'') && e.scrollHeight > 400)`);
  console.log('重开后菜单状态:', menuOpen);
}

// 逐屏 scrollTop 读取
const readVisible = () => ev(`(() => {
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
    const cs = getComputedStyle(e);
    out.push({ y: Math.round(r.y), x: Math.round(r.x), t: txt.slice(0, 24), fs: cs.fontSize, color: cs.color, w: Math.round(r.width) });
  }
  return out.sort((a,b) => a.y - b.y || a.x - b.x);
})()`);

const collected = [];
let prevSig = '';
for (let round = 0; round < 25; round++) {
  const items = await readVisible();
  const sig = items.map(i => i.t).join('|');
  if (sig !== prevSig) {
    collected.push(...items.filter(i => !collected.some(c => c.t === i.t)));
    console.log(`round ${round}: +${items.length} 项（累计 ${collected.length}）`);
    prevSig = sig;
    if (round % 4 === 0) await shot(`E:/VBcoding/bijiapp/ops/观测/windows/37-菜单滚动-${round}.png`);
  }
  // scrollTop += 280
  const sc = await ev(`(() => {
    const els = [...document.querySelectorAll('div')].filter(e => /基础块|AI 助手/.test(e.textContent||'') && e.scrollHeight > e.clientHeight + 4);
    const s = els[els.length - 1];
    if (!s) return 'closed';
    s.scrollTop = Math.min(s.scrollTop + 280, s.scrollHeight);
    return [s.scrollTop, s.scrollHeight, s.clientHeight];
  })()`);
  if (sc === 'closed') { console.log('菜单关闭，停止'); break; }
  const [st, sh, ch] = sc;
  await sleep(500);
  if (st + ch >= sh - 4 && round > 0) {
    const fin = await readVisible();
    collected.push(...fin.filter(i => !collected.some(c => c.t === i.t)));
    console.log('到底，累计:', collected.length);
    await shot('E:/VBcoding/bijiapp/ops/观测/windows/37-菜单-到底.png');
    break;
  }
}
await writeFile('E:/VBcoding/bijiapp/ops/观测/windows/37-菜单全量.json', JSON.stringify(collected, null, 1));
console.log('=== 全量类型数:', collected.length, '===');
console.log(JSON.stringify(collected.map(c => c.t), null, 0).slice(0, 3000));
ws.close();
process.exit(0);
