/**
 * 块类型观测 · 步骤 3：逐个插入核心块型并截图/度量
 * 策略：正文末块输入 "/<快捷码>" → 回车（快捷码精准命中，避开菜单导航）
 *       → 记录新块 DOM（rect/类名）+ 截图
 * 每种块一个证据文件；跑完由 blk-99 清理页面。
 * 用法: node blk-03-insert.mjs <起始序号>
 */
import { writeFile } from 'node:fs/promises';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const t = list.find(t => t.type === 'webview' && (t.url || '').includes('flowus'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 900;
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
  if (r.exceptionDetails) return 'ERR:' + (r.exceptionDetails.exception?.description || '').slice(0, 160);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r?.data) await writeFile(name, Buffer.from(r.data, 'base64'));
};
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
const click = async (x, y, count = 1) => {
  await move(x, y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: count });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: count });
  await sleep(600);
};
const type = async (text) => {
  // 逐字符 keyEvent（text 参数让编辑器收到字符）
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: '', windowsVirtualKeyCode: 0, text: ch, unmodifiedText: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: '', windowsVirtualKeyCode: 0 });
    await sleep(80);
  }
  await sleep(600);
};
const enter = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1000);
};

// 正文块定位（排除标题：标题 h=64 且 y<200；正文块 h≈34）
const findBody = async () => ev(`(() => {
  const els = [...document.querySelectorAll('[contenteditable=true]')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.height <= 50 && r.y > 200;
  });
  const e = els[els.length - 1];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), n: els.length };
})()`);

// 度量：刚插入的块 = 最后一个正文块 + 其内部结构
const measure = async (tag) => {
  const m = await ev(`(() => {
    const els = [...document.querySelectorAll('[contenteditable=true]')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.height <= 60 && r.y > 200;
    });
    const e = els[els.length - 1];
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const block = e.closest('[data-block-id]') || e.parentElement;
    const br = block.getBoundingClientRect();
    return { blockRect: [Math.round(br.x), Math.round(br.y), Math.round(br.width), Math.round(br.height)], text: (e.textContent||'').trim().slice(0, 40), cls: String(block.className).slice(0, 60), tag: block.tagName, dataset: JSON.stringify({...block.dataset}).slice(0, 120) };
  })()`);
  console.log(`[${tag}]`, JSON.stringify(m));
  return m;
};

const IDX = parseInt(process.argv[2] || '0');
// 核心块型（观复重做需要的），快捷码来自 / 菜单实测
const TYPES = [
  ['标题1', 'h1'], ['标题2', 'h2'], ['标题3', 'h3'], ['标题4', 'h4'],
  ['待办列表', 'dblb'], ['项目列表', 'xmlb'], ['编号列表', 'bhlb'],
  ['折叠列表', 'zdlb'], ['折叠标题1', 'zdbt1'],
  ['引述文字', 'yswz'], ['着重文字', 'zzwz'],
  ['分割线', 'fgx'], ['代码片段', 'dmpd'], ['数学公式', 'sxgs'],
  ['简单表格', 'jdbg'], ['行内公式', null], // 行内公式无快捷码独立入口，跳过自动测
  ['网页书签', 'wysq'], ['图片', 'tp'], ['视频', 'sp'], ['文件', 'wj'],
];
const START = IDX;
for (let i = START; i < TYPES.length; i++) {
  const [name, code] = TYPES[i];
  if (!code) { console.log(`-- 跳过 ${name}（无快捷码）`); continue; }
  const body = await findBody();
  if (!body || body === 'TIMEOUT') { console.log('ABORT: 正文找不到'); break; }
  await click(body.x + 80, body.y + body.h / 2);
  await sleep(400);
  await type('/' + code);
  await sleep(700);
  // 菜单中回车选中（首个候选应为该类型）
  await enter();
  await sleep(1100);
  console.log(`-- [${i}] ${name} (/${code}) --`);
  await measure(name);
  await shot(`E:/VBcoding/bijiapp/ops/观测/windows/38-块型-${String(i).padStart(2, '0')}-${name}.png`);
}
ws.close();
process.exit(0);
