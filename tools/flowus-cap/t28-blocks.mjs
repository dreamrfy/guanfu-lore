/**
 * 剩余块类型 —— 斜杠菜单「过滤 + 点击」法（M0-T28）
 * 关键改进：输入 `/`+中文关键词过滤菜单 → **按坐标点选条目**（不是回车选第一项）。
 * 判定升级：同时比"新增 uuid"与"同 uuid 的 type 变化"。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = 'E:/dev/tmp/flowus-cap/capture/m0-t28';
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

const readBlocks = () => page.evaluate(async (id) => {
  const j = await (await fetch('/api/docs/' + id, { headers: { accept: 'application/json' } })).json();
  const bs = (j.data || {}).blocks || {};
  const root = Object.values(bs).find((b) => b && !b.parentId) || Object.values(bs)[0];
  const out = [];
  const walk = (bid) => {
    const b = bs[bid]; if (!b) return;
    const d = b.data || {};
    out.push({ uuid: bid, type: b.type, level: d.level === undefined ? null : d.level });
    (b.subNodes || []).forEach(walk);
  };
  if (root) walk(root.uuid);
  return out;
}, DOC);

// 找斜杠菜单面板里的条目（含位置），并顺带记录有无 data-test-id
const menuItems = () => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.next-modal, [role="menu"], [data-popper-placement]').forEach((pane) => {
    const pb = pane.getBoundingClientRect();
    if (pb.width < 100 || pb.height < 60) return;
    pane.querySelectorAll('div,li,[role="menuitem"]').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.height < 22 || r.height > 50 || r.width < 80) return;
      const t = (e.innerText || '').trim().replace(/\s+/g, ' ');
      if (!t || t.length > 24 || e.children.length > 3) return;
      out.push({
        t,
        x: +(r.x + r.width / 2).toFixed(1),
        y: +(r.y + r.height / 2).toFixed(1),
        testId: e.getAttribute('data-test-id'),
      });
    });
  });
  const seen = new Set();
  return out.filter((o) => { const k = o.t + o.y; if (seen.has(k)) return false; seen.add(k); return true; });
});

await page.mouse.click(900, 280);
await page.waitForTimeout(1200);
let prev = await readBlocks();

const targets = [['折叠列表', '折叠列表'], ['折叠标题1', '折叠标题1'], ['简单表格', '简单表格'], ['思维导图', '思维导图'], ['按钮', '按钮'], ['同步块', '同步块'], ['数据图表', '数据图表']];

for (const [label, kw] of targets) {
  const step = { label, kw };
  try {
    await page.keyboard.press('End');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await page.keyboard.type('/' + kw, { delay: 60 });
    await page.waitForTimeout(2000);
    const items = await menuItems();
    step.menuItems = items.map((i) => i.t);
    step.hasTestId = items.some((i) => i.testId);
    // 找名字最匹配的那条（优先完全相等，否则包含关键词）
    let target = items.find((i) => i.t === kw) || items.find((i) => i.t.includes(kw)) || items[0];
    if (target) {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(2200);
      step.clicked = target.t;
    } else {
      step.clicked = null;
      await page.keyboard.press('Escape');
    }
    const now = await readBlocks();
    const prevIds = new Set(prev.map((b) => b.uuid));
    const added = now.filter((b) => !prevIds.has(b.uuid));
    // 同 uuid 类型变化
    const changed = now.filter((b) => { const o = prev.find((p) => p.uuid === b.uuid); return o && o.type !== b.type; });
    step.added = added.map((a) => a.type);
    step.changed = changed.map((c) => ({ from: (prev.find((p) => p.uuid === c.uuid) || {}).type, to: c.type }));
    step.types = now.map((b) => b.type);
    prev = now;
    console.log(`${label.padEnd(6)} 菜单${items.length}项 testId=${step.hasTestId} 点=${step.clicked} 新增=${JSON.stringify(step.added)} 类型变=${JSON.stringify(step.changed)}`);
  } catch (e) {
    step.err = e.message.split('\n')[0];
    console.log(`${label.padEnd(6)} 出错: ${step.err}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
  R.steps.push(step);
  await page.waitForTimeout(600);
}
await page.screenshot({ path: OUT + '/blocks.png' });
fs.writeFileSync(OUT + '/block-types4.json', JSON.stringify(R, null, 1));
console.log('最终块序列:', prev.map((b) => b.type).join(','));
await browser.close();
