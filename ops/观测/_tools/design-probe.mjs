/**
 * 只读取证：从 FlowUs 客户端 webview 抓「设计系统」原始数据
 * - 不点击、不导航、不改状态；只读 CSSOM + 当前 DOM 的计算样式
 * - 输出 ops/观测/专项/flowus-styles.json（本地证据，不入库）
 *
 * 用法：node ops/观测/_tools/design-probe.mjs [out.json]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9222';
const OUT = process.argv[2] || 'ops/观测/专项/flowus-styles.json';

const list = await (await fetch(`${BASE}/json/list`)).json();
const target =
  list.find((t) => t.type === 'webview' && (t.url || '').includes('flowus')) ||
  list.find((t) => (t.url || '').includes('flowus')) ||
  list.find((t) => t.type === 'page');
if (!target) {
  console.error('no flowus target');
  process.exit(1);
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          ws.close();
        },
      });
    ws.onerror = (e) => reject(e);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    };
  });
}

const probe = String.raw`(() => {
  const out = { url: location.href, title: document.title, ts: new Date().toISOString(), viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio } };
  const cs = (el) => el ? getComputedStyle(el) : null;
  const P = ['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','border-radius','box-shadow','border-color','transition-duration','transition-timing-function','animation-duration','animation-timing-function','padding','height','width'];
  const pick = (el) => { const s = cs(el); const o = {}; for (const p of P) o[p] = s.getPropertyValue(p); return o; };
  out.body = pick(document.body);
  out.html = pick(document.documentElement);
  out.themeAttrs = { htmlClass: document.documentElement.className, htmlData: JSON.stringify(document.documentElement.dataset), bodyClass: document.body.className };

  const sels = ['#root','[class*="sidebar"]','[class*="Sidebar"]','[class*="topbar"]','[class*="Topbar"]','[class*="header"]','[class*="Header"]','button','input','textarea','[contenteditable="true"]','.ProseMirror','h1','h2','h3','h4','a','[role="button"]','[role="menuitem"]','[class*="menu"]','[class*="Menu"]','[class*="tab"]','[class*="Tab"]','[class*="tooltip"]','[class*="select"]'];
  out.samples = {};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el) out.samples[sel] = { tag: el.tagName, cls: String(el.className || '').slice(0,160), ...pick(el) };
  }

  const freq = {};
  const leaves = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent.trim() && e.getBoundingClientRect().width > 0).slice(0, 4000);
  for (const el of leaves) {
    const s = cs(el);
    const k = [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.color, s.letterSpacing].join(' | ');
    freq[k] = (freq[k] || 0) + 1;
  }
  out.textStyles = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,80).map(([k,n]) => ({ n, k }));

  const svg = {};
  for (const el of document.querySelectorAll('svg')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) { const k = Math.round(r.width) + 'x' + Math.round(r.height); svg[k] = (svg[k] || 0) + 1; }
  }
  out.svgSizes = svg;

  const vars = {}, decls = {}, keyframes = {}, media = new Set(), selectors = [];
  const W = ['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','background','border-radius','box-shadow','border','border-color','transition','transition-duration','transition-timing-function','animation','animation-duration','animation-timing-function','padding','gap','z-index','backdrop-filter','opacity','width','height'];
  function walk(rules) {
    for (const rule of rules) {
      try {
        if (rule.type === CSSRule.STYLE_RULE) {
          const sel = rule.selectorText || '';
          if (sel.includes(':root') || sel.includes('html') || sel.includes('[data-theme') || sel.includes('body')) {
            for (const p of rule.style) if (p.startsWith('--')) vars[sel + ' :: ' + p] = rule.style.getPropertyValue(p).trim();
          }
          for (const p of W) {
            const v = rule.style.getPropertyValue(p);
            if (v) { (decls[p] = decls[p] || {}); const k = v.trim(); decls[p][k] = (decls[p][k] || 0) + 1; }
          }
          if (selectors.length < 500 && rule.cssText.length < 500) selectors.push(rule.cssText);
        } else if (rule.type === CSSRule.KEYFRAMES_RULE) {
          keyframes[rule.name] = rule.cssText.slice(0, 1000);
        } else if (rule.type === CSSRule.MEDIA_RULE) {
          media.add(rule.conditionText || rule.media.mediaText);
          walk(rule.cssRules);
        } else if (rule.cssRules) {
          walk(rule.cssRules);
        }
      } catch (e) {}
    }
  }
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch (e) {} }
  out.vars = vars;
  out.decls = Object.fromEntries(Object.entries(decls).map(([p,m]) => [p, Object.entries(m).sort((a,b) => b[1]-a[1]).slice(0,60)]));
  out.keyframes = keyframes;
  out.media = [...media];
  out.selectorsSample = selectors.slice(0,250);
  return out;
})()`;

const client = await connect(target.webSocketDebuggerUrl);
const res = await client.send('Runtime.evaluate', {
  expression: probe,
  returnByValue: true,
  awaitPromise: true,
});
client.close();
if (res.exceptionDetails) {
  console.error(JSON.stringify(res.exceptionDetails, null, 2));
  process.exit(1);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(res.result.value, null, 2));
console.log('wrote', OUT, 'target=', target.url, 'title=', target.title);
