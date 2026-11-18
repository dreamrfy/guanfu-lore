/**
 * 只读取证 2：聚合 FlowUs 计算样式（颜色/字号/圆角/阴影/动效/类名/文案/图标）
 * 不点击、不导航。输出 ops/观测/专项/flowus-aggregate.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const OUT = process.argv[2] || 'ops/观测/专项/flowus-aggregate.json';
const list = await (await fetch(`${BASE}/json/list`)).json();
const target =
  list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus')) ||
  list.find((t) => (t.url || '').includes('flowus')) ||
  list.find((t) => t.type === 'page');
if (!target) { console.error('no flowus target'); process.exit(1); }

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
    ws.onerror = reject;
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

const probe = String.raw`(() => {
  const out = { url: location.href, title: document.title, ts: new Date().toISOString() };
  const rootCS = getComputedStyle(document.documentElement);
  const custom = {};
  try {
    for (const [k, v] of document.documentElement.computedStyleMap()) {
      if (k.startsWith('--')) custom[k] = String(v).trim();
    }
  } catch (e) { custom.__error = String(e); }
  out.customProps = custom;

  const props = ['color','background-color','border-color','border-radius','box-shadow','font-family','font-size','font-weight','line-height','letter-spacing','transition-duration','transition-timing-function','animation-duration','animation-timing-function','outline-color','outline-width','z-index','backdrop-filter'];
  const agg = {}; for (const p of props) agg[p] = {};
  const add = (p, v, el) => {
    if (!v || v === 'none' || v === 'normal' || v === '0px' || v === 'rgba(0, 0, 0, 0)' || v === 'auto') return;
    const m = agg[p];
    if (!m[v]) m[v] = { n: 0, cls: String(el.className || '').slice(0, 100) };
    m[v].n++;
  };
  const els = [...document.querySelectorAll('body *')].slice(0, 12000);
  for (const el of els) {
    const s = getComputedStyle(el);
    for (const p of props) add(p, s.getPropertyValue(p), el);
  }
  out.agg = Object.fromEntries(Object.entries(agg).map(([p, m]) => [p, Object.entries(m).sort((a,b) => b[1].n - a[1].n).slice(0, 45)]));

  const classFreq = {};
  for (const el of els) {
    const c = String(el.className || '');
    if (!c || c.includes(' ')) continue;
    classFreq[c] = (classFreq[c] || 0) + 1;
  }
  out.classFreq = Object.entries(classFreq).sort((a,b) => b[1]-a[1]).slice(0, 200);

  const tokenFreq = {};
  for (const el of els) {
    const c = String(el.className || '');
    if (!c) continue;
    for (const t of c.split(/\s+/)) if (t.length > 1) tokenFreq[t] = (tokenFreq[t] || 0) + 1;
  }
  out.tokenFreq = Object.entries(tokenFreq).sort((a,b) => b[1]-a[1]).slice(0, 300);

  const svg = {};
  for (const el of document.querySelectorAll('svg')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) {
      const k = Math.round(r.width) + 'x' + Math.round(r.height);
      if (!svg[k]) svg[k] = { n: 0, hrefs: {} };
      svg[k].n++;
      const use = el.querySelector('use');
      const href = use && (use.getAttribute('href') || use.getAttribute('xlink:href'));
      if (href) svg[k].hrefs[href] = (svg[k].hrefs[href] || 0) + 1;
    }
  }
  out.svg = svg;

  const copy = { aria: {}, title: {}, placeholder: {}, alt: {} };
  for (const el of document.querySelectorAll('[aria-label]')) copy.aria[el.getAttribute('aria-label')] = (copy.aria[el.getAttribute('aria-label')] || 0) + 1;
  for (const el of document.querySelectorAll('[title]')) copy.title[el.getAttribute('title')] = (copy.title[el.getAttribute('title')] || 0) + 1;
  for (const el of document.querySelectorAll('[placeholder]')) copy.placeholder[el.getAttribute('placeholder')] = (copy.placeholder[el.getAttribute('placeholder')] || 0) + 1;
  for (const el of document.querySelectorAll('img[alt]')) copy.alt[el.getAttribute('alt')] = (copy.alt[el.getAttribute('alt')] || 0) + 1;
  out.copy = copy;

  const regions = {};
  const sel = {
    sidebar: '[class*="sidebar"],[class*="Sidebar"]',
    header: '[class*="page-header"],[class*="header"]',
    content: '[class*="content"],[class*="Content"]',
    main: 'main',
    topbar: '[class*="topbar"],[class*="Topbar"]',
  };
  for (const [k, s] of Object.entries(sel)) {
    const el = document.querySelector(s);
    if (el) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); regions[k] = { x: r.x, y: r.y, w: r.width, h: r.height, bg: cs.backgroundColor, border: cs.borderColor, padding: cs.padding, cls: String(el.className || '').slice(0, 120) }; }
  }
  out.regions = regions;

  const overlays = [];
  for (const el of document.querySelectorAll('[role="menu"],[role="dialog"],[role="tooltip"],[class*="popover"],[class*="Popover"],[class*="modal"],[class*="Modal"],[class*="dropdown"],[class*="Dropdown"]')) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    overlays.push({ tag: el.tagName, role: el.getAttribute('role'), cls: String(el.className || '').slice(0, 100), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow, z: cs.zIndex });
  }
  out.overlays = overlays.slice(0, 40);
  return out;
})()`;

const client = await connect(target.webSocketDebuggerUrl);
const res = await client.send('Runtime.evaluate', { expression: probe, returnByValue: true, awaitPromise: true });
client.close();
if (res.exceptionDetails) { console.error(JSON.stringify(res.exceptionDetails, null, 2)); process.exit(1); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res.result.value, null, 2));
console.log('wrote', OUT);
