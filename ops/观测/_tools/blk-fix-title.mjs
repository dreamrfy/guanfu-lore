/**
 * 修复观测页标题：去掉误输入的 "/"
 * 流程：三击标题选中全部 → 输入正确名称「块类型观测-临时」
 */
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 300;
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
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y, count = 1) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: count });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: count });
  await sleep(700);
};

// 1. 定位标题元素（大字号 40px 那个 contenteditable/textarea）
const title = await ev(`(() => {
  const els = [...document.querySelectorAll('[contenteditable=true], textarea, input')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.y < 300 && r.height >= 40 && r.height <= 80 && r.x > 300;
  });
  const e = els[0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), tag: e.tagName, cls: String(e.className).slice(0,40) };
})()`);
console.log('标题元素:', JSON.stringify(title));
if (!title || title === 'TIMEOUT') { console.log('ABORT'); process.exit(1); }

// 2. 三击全选标题文本
await click(title.x, title.y, 3);
await sleep(600);

// 3. 输入正确标题（覆盖选区）
await send('Input.insertText', { text: '块类型观测-临时' });
await sleep(600);
// 回车确认
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await sleep(800);

console.log('修复后标题:', await ev('document.title'));
console.log('侧栏行:', await ev(`[...document.querySelectorAll('div')].filter(e => { const r=e.getBoundingClientRect(); return r.x>20 && r.x<228 && e.children.length===0 && /块类型观测/.test(e.textContent||''); }).map(e => (e.textContent||'').trim())[0] || 'not-found'`));
ws.close();
process.exit(0);
