/**
 * 极简 CDP 客户端（Node 24 自带 fetch + WebSocket，无 npm 依赖）
 *
 * 用法：
 *   node cdp.mjs targets
 *   node cdp.mjs eval "<js 表达式>"      # 输出结果 JSON
 *   node cdp.mjs shot <out.png>
 *   node cdp.mjs click <x> <y>
 *   node cdp.mjs type "<文本>"
 *   node cdp.mjs key <Enter|Escape|Tab|Backspace>
 *
 * 目标选择：优先取 url 里含 flowus 的 page；可用 CDP_TARGET_ID 指定。
 */
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';

async function targets() {
  const r = await fetch(`${BASE}/json/list`);
  return r.json();
}

function pickPage(list) {
  const wanted = process.env.CDP_TARGET_ID;
  if (wanted) return list.find((t) => t.id === wanted) || list[0];
  // Electron 客户端里 FlowUs 跑在 webview 里；优先选带 flowus 的那个目标
  return list.find((t) => (t.url || '').includes('flowus'))
    || list.find((t) => t.type === 'page')
    || list[0];
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = nextId++;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { ws.close(); },
    });
    ws.onerror = (e) => reject(e);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
      }
    };
  });
}

const [, , cmd, ...args] = process.argv;
const list = await targets();
const page = pickPage(list);
if (!page) { console.error('no page target'); process.exit(1); }
const cdp = await connect(page.webSocketDebuggerUrl);

try {
  if (cmd === 'targets') {
    console.log(JSON.stringify(list.map((t) => ({ id: t.id, type: t.type, url: t.url, title: t.title })), null, 2));
  } else if (cmd === 'eval') {
    const expr = args.join(' ');
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { console.error(JSON.stringify(r.exceptionDetails)); process.exit(2); }
    console.log(JSON.stringify(r.result.value));
  } else if (cmd === 'shot') {
    const { writeFile } = await import('node:fs/promises');
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(args[0], Buffer.from(r.data, 'base64'));
    console.log(`saved ${args[0]}`);
  } else if (cmd === 'click') {
    const x = Number(args[0]); const y = Number(args[1]);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    console.log(`clicked ${x},${y}`);
  } else if (cmd === 'type') {
    const text = args.join(' ');
    await cdp.send('Input.insertText', { text });
    console.log(`typed ${text.length} chars`);
  } else if (cmd === 'key') {
    const key = args[0];
    const codes = { Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' }, Escape: { key: 'Escape', code: 'Escape', keyCode: 27 }, Tab: { key: 'Tab', code: 'Tab', keyCode: 9 }, Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 } };
    const k = codes[key];
    if (!k) { console.error('unsupported key'); process.exit(1); }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, text: k.text });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode });
    console.log(`key ${key}`);
  } else {
    console.error('unknown command');
    process.exit(1);
  }
} finally {
  cdp.close();
}
