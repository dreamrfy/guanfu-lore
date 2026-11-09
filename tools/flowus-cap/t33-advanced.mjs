/**
 * 高级块四件套（M0-T33 第②项）
 * 打 `/`（不输过滤词）→ 把菜单滚到底（高级块在最后）→ 找到目标行点选 → 读接口 diff。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t33';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
const R = { steps: [] };

await page.goto('https://flowus.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
R['0 基线'] = await page.evaluate(() => document.querySelectorAll('[data-test-id="aside-item-toc"]').length);

await page.locator('[data-test-id="aside-toc-header-create-by-private"]').first().click({ force: true });
await page.waitForTimeout(5500);
const DOC = (page.url().match(/([0-9a-f-]{36})\s*$/) || [])[1];
R['1 docId'] = DOC;
console.log('临时页:', DOC);
await page.mouse.click(900, 300);
await page.waitForTimeout(1300);

const readBlocks = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = [];
  const walk = (bid) => { const b = bs[bid]; if (!b) return; out.push({ uuid: bid, type: b.type }); (b.subNodes || []).forEach(walk); };
  if (root) walk(root.uuid);
  return out;
}, DOC);

// 打 / → 滚到底 → 收集全部行
const openAndScroll = async () => {
  await page.keyboard.type('/', { delay: 80 });
  await page.waitForTimeout(2200);
  const all = new Map();
  for (let pass = 0; pass < 10; pass++) {
    const rows = await page.evaluate((p) => {
      let pane = null;
      document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((e) => {
        const b = e.getBoundingClientRect();
        if (b.width < 100 || b.height < 60) return;
        if (!pane || b.height > pane.h) pane = { el: e, h: Math.round(b.height) };
      });
      if (!pane) return null;
      let sc = null;
      pane.el.querySelectorAll('*').forEach((e) => {
        const cs = getComputedStyle(e);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 10) sc = e;
      });
      if (sc) sc.scrollTop = p * 420;
      const out = [];
      pane.el.querySelectorAll('div,li,[role="menuitem"]').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.height < 22 || r.height > 50 || r.width < 90) return;
        const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
        if (!t || t.length > 26 || e.children.length > 3) return;
        out.push({ t, x: +(r.x + r.width / 2).toFixed(1), y: +(r.y + r.height / 2).toFixed(1) });
      });
      return out;
    }, pass);
    if (!rows) break;
    rows.forEach((r) => all.set(r.t, r));
    await page.waitForTimeout(320);
  }
  return all;
};

const targets = ['思维导图', '按钮', '同步块', '数据图表'];
for (const label of targets) {
  const step = { label };
  try {
    await page.keyboard.press('End');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    const prev = await readBlocks();
    const all = await openAndScroll();
    step.menuSize = all.size;
    step.hasTarget = all.has(label);
    const target = all.get(label) || [...all.entries()].find(([k]) => k.startsWith(label))?.[1];
    if (target) {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(2600);
      step.clicked = target.t;
    } else {
      step.clicked = null;
      await page.keyboard.press('Escape');
    }
    const now = await readBlocks();
    const prevIds = new Set(prev.map((b) => b.uuid));
    step.added = now.filter((b) => !prevIds.has(b.uuid)).map((b) => b.type);
    step.changed = now.filter((b) => { const o = prev.find((p) => p.uuid === b.uuid); return o && o.type !== b.type; })
      .map((c) => ({ from: (prev.find((p) => p.uuid === c.uuid) || {}).type, to: c.type }));
    console.log(`${label.padEnd(5)} 菜单${all.size}项 有=${step.hasTarget} 点=${step.clicked} 新增=${JSON.stringify(step.added)} 变=${JSON.stringify(step.changed)}`);
  } catch (e) {
    step.err = e.message.split('\n')[0];
    console.log(`${label.padEnd(5)} 出错: ${step.err}`);
    await page.keyboard.press('Escape');
  }
  R.steps.push(step);
  await page.waitForTimeout(700);
}
await page.screenshot({ path: OUT + '/blocks.png' });
fs.writeFileSync(OUT + '/advanced-blocks.json', JSON.stringify(R, null, 1));
await browser.close();
