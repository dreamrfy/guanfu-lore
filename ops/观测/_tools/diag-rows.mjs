/** 读侧栏 255~300 区域元素（找私人组头 + ＋） */
(async () => {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 1;
  const send = (m, p = {}) => new Promise((res) => {
    const i = id++;
    const timer = setTimeout(() => res(null), 5000);
    ws.onmessage = (ev) => { const m2 = JSON.parse(ev.data); if (m2.id === i) { clearTimeout(timer); res(m2.result); } };
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  const r = await send('Runtime.evaluate', { expression: `(() => {
    const els = [...document.querySelectorAll('div,span,button')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.y >= 240 && r.y <= 310 && r.x < 228 && r.width > 0;
    });
    return els.slice(0, 25).map(e => { const r = e.getBoundingClientRect(); return Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' [' + (e.textContent||'').trim().slice(0,12) + '] <' + e.tagName + '.' + String(e.className).slice(0,28) + '>'; });
  })()`, returnByValue: true });
  console.log(JSON.stringify(r?.result?.value ?? r, null, 1));
  ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
