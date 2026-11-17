/**
 * 现场清理：把我探针多开的页签关掉（红线 4：先核对目标）
 * 逻辑：页签数 >1 时，保留第 1 个（原始），关闭最后一个；
 *      关闭前核对标题 == 第 1 个页签的标题（同页副本才动）。
 */
const BASE = 'http://127.0.0.1:9222';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && (t.url || '').startsWith('file://'));
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 1; const pend = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = id++; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
await new Promise((r) => { ws.onopen = r; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (ex) => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 200)); return r.result.value; };
const click = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(900);
};

let count = await ev(`document.querySelectorAll('.modern-tab').length`);
console.log('当前页签数:', count);
while (count > 1) {
  const info = await ev(`(() => {
    const tabs = [...document.querySelectorAll('.modern-tab')];
    const first = tabs[0].querySelector('.tab-title')?.textContent?.trim();
    const last = tabs[tabs.length - 1];
    const lastTitle = last.querySelector('.tab-title')?.textContent?.trim();
    const b = last.querySelector('.tab-close-btn');
    if (!b) return { err: 'no-close-btn' };
    const r = b.getBoundingClientRect();
    return { first, lastTitle, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
  })()`);
  if (info.err) { console.log('关闭按钮取不到，停手:', info); break; }
  if (info.first !== info.lastTitle) { console.log(`标题不一致（first=${info.first} last=${info.lastTitle}），红线 4 停手`); break; }
  console.log(`核对通过（两个页签同为「${info.first}」，关闭末尾副本 @${info.x},${info.y}）`);
  await click(info.x, info.y);
  count = await ev(`document.querySelectorAll('.modern-tab').length`);
  console.log('关闭后页签数:', count);
}
console.log('最终状态: 页签数 =', await ev(`document.querySelectorAll('.modern-tab').length`));
const finalTitles = await ev(`[...document.querySelectorAll('.modern-tab .tab-title')].map(e=>e.textContent.trim())`);
console.log('剩余页签标题:', JSON.stringify(finalTitles));
ws.close();
process.exit(0);
