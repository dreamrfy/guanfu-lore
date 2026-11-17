/** 诊断：页面当前态 + 图标行语义（修 pend 复用 bug） */
(async () => {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const target = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const pend = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => {
    const i = id++;
    pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id);
      pend.delete(m.id);
      p.res(m.result);
    }
  };
  await new Promise(r => { ws.onopen = r; });
  const ev = async ex => {
    const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true });
    if (r.exceptionDetails) return 'ERR:' + JSON.stringify(r.exceptionDetails).slice(0, 150);
    return r.result.value;
  };
  console.log('URL:', await ev('location.href.slice(0,100)'));
  console.log('title:', await ev('document.title'));
  const sem = await ev(`(() => {
    const els = [...document.querySelectorAll('div,button,a')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.y >= 54 && r.y <= 86 && r.width >= 28 && r.width <= 36 && r.height >= 28 && r.height <= 36 && r.x >= 0 && r.x < 230;
    });
    return els.map(e => ({ x: Math.round(e.getBoundingClientRect().x), aria: e.getAttribute('aria-label'), title: e.getAttribute('title'), svgPath: (e.querySelector('svg path')?.getAttribute('d') || '').slice(0, 30), cls: String(e.className).slice(0, 60) }));
  })()`);
  console.log('icons:', JSON.stringify(sem, null, 1));
  ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
