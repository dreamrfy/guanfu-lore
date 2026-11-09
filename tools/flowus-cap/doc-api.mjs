/**
 * 文档块模型深挖（M0-T08 续）
 * 只输出结构（键名 / 类型 / 计数），字符串内容一律不落地。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t08';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// 打开一篇普通文档页，拿到它的 docId
const items = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]')).map((e) => ({ href: e.getAttribute('href') || '', t: (e.innerText || '').trim() }))
);
const link = items.find((x) => x.t === '归档历史材料') || items.find((x) => /\/[0-9a-f-]{36}$/.test(x.href));
await page.locator('[data-test-id="aside-item-toc"]').filter({ hasText: link.t }).first().click({ force: true });
await page.waitForTimeout(5000);
const docId = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
console.log('docId:', docId, '| 页面:', link.t);

// 在页面上下文里直接请求文档接口（复用登录态）
const raw = await page.evaluate(async (id) => {
  const r = await fetch(`/api/docs/${id}`, { headers: { accept: 'application/json' } });
  const t = await r.text();
  return { status: r.status, len: t.length, body: t };
}, docId);
console.log('文档接口:', raw.status, raw.len, '字节');

let parsed = null;
try { parsed = JSON.parse(raw.body); } catch (e) { console.log('非 JSON'); }

const schema = { docId, status: raw.status, len: raw.len, topKeys: [], typeCounts: {}, shapes: {} };
if (parsed) {
  schema.topKeys = Object.keys(parsed);
  const seenShape = new Set();
  const walk = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > 8) return;
    if (Array.isArray(n)) return n.slice(0, 300).forEach((x) => walk(x, depth + 1));
    const keys = Object.keys(n).sort().join(',');
    if (seenShape.size < 40 && !seenShape.has(keys)) { seenShape.add(keys); schema.shapes[keys.slice(0, 160)] = (schema.shapes[keys.slice(0, 160)] || 0) + 1; }
    if (typeof n.type === 'string') schema.typeCounts[n.type] = (schema.typeCounts[n.type] || 0) + 1;
    Object.keys(n).slice(0, 50).forEach((k) => walk(n[k], depth + 1));
  };
  walk(parsed, 0);
}

fs.writeFileSync(OUT + '/doc-api-schema.json', JSON.stringify(schema, null, 1));
console.log('顶层键:', schema.topKeys.join(', '));
console.log('=== type 字段分布 ===');
Object.entries(schema.typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([t, n]) => console.log('  ' + String(n).padStart(4) + '  ' + t));
console.log('=== 对象形状（键组合，最多 40 种）===');
Object.keys(schema.shapes).slice(0, 25).forEach((k) => console.log('  ' + k));
await browser.close();
