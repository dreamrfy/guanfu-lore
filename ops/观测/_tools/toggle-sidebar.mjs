/** Ctrl+Backslash 展开侧栏（转义放进文件避免 shell 引号问题） */
(async () => {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const t = list.find(t => t.type === 'webview');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  const send = (m, p = {}) => new Promise(res => { const id = Math.floor(Math.random()*100000); const h = (ev) => { const mm = JSON.parse(ev.data); if (mm.id === id) { ws.removeEventListener('message', h); res(mm.result); } }; ws.addEventListener('message', h); setTimeout(() => { ws.removeEventListener('message', h); res(null); }, 4000); ws.send(JSON.stringify({ id, method: m, params: p })); });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: ['ctrl'], key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: ['ctrl'], key: '\\', code: 'Backslash', windowsVirtualKeyCode: 220 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: ['ctrl'], key: '\\', code: 'Backslash', windowsVirtualKeyCode: 220 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: [], key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
  await new Promise(r => setTimeout(r, 1000));
  console.log('sent');
  ws.close();
  process.exit(0);
})().catch(e => { console.log(e.message); process.exit(1); });
