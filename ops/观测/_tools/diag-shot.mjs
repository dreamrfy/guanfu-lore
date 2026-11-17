/**
 * 微步探针：diag-shot —— 独立进程截图 + 读主区文本 + URL
 * 用法: node diag-shot.mjs <outfile-prefix>
 * 每个调用都是全新 WS，任何挂起只影响自身。
 */
import { writeFile } from 'node:fs/promises';

const prefix = process.argv[2] || 'tmp';
(async () => {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const target = list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus'));
  if (!target) { console.log('no-webview'); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; setTimeout(() => j(new Error('ws-timeout')), 6000); });
  let nextId = 1; const pending = new Map();
  const send = (method, params = {}) => new Promise((res) => {
    const id = nextId++;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); res(null); } }, 5000);
  });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const r = pending.get(m.id); pending.delete(m.id); r(m.result); } };

  const evalR = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (!r) return 'EVAL-TIMEOUT';
    if (r.exceptionDetails) return 'EVAL-ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 100);
    return r.result.value;
  };
  const s = await send('Page.captureScreenshot', { format: 'png' });
  if (s && s.data) await writeFile(`${prefix}.png`, Buffer.from(s.data, 'base64'));
  console.log('URL:', await evalR('location.href.slice(0,95)'));
  console.log('TITLE:', await evalR('document.title.slice(0,30)'));
  const mainText = await evalR(`(() => {
    const els = [...document.querySelectorAll('h1,h2,h3,span,div,button,a')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.x > 230 && r.width > 0 && r.width < 500 && r.y >= 0 && r.y < 500 && e.children.length === 0 && (e.textContent||'').trim().length > 0 && (e.textContent||'').trim().length < 40;
    });
    return els.slice(0, 22).map(e => { const r = e.getBoundingClientRect(); return Math.round(r.x) + ',' + Math.round(r.y) + ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + '] ' + (e.textContent||'').trim().slice(0,30); }).join('\\n');
  })()`);
  console.log('MAIN-TEXT:\n' + mainText);
  ws.close();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.log('ERR:', e.message); process.exit(1); });
