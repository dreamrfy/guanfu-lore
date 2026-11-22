// W66 补齐点验：冻结列菜单 → 横向滚动时冻结单元格钉住 → 解冻恢复
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
const CHROME_PATHS = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/W66补齐";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
let failed = 0;
const fail = (m) => { console.error("FAIL: " + m); failed++; throw new Error(m); };
try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });
  const ids = await page.evaluate(async () => {
    const s = window.__gf_store.getState();
    const id = await s.createCollection("冻结列走查表");
    await s.addField(id, "text");
    await s.addField(id, "number");
    await s.addField(id, "text");
    for (let i = 0; i < 3; i++) await s.addRecord(id);
    await window.__gf_store.getState().openCollection(id);
    return id;
  });
  await page.locator(".collection").waitFor({ timeout: 5000 });
  // 撑宽：把字段列拉宽，确保横向可滚

  await page.evaluate(async (id) => {
    const s = window.__gf_store.getState();
    const c = s.collections.find((x) => x.id === id);
    const fields = c.fields.slice(1);
    for (const [i, f] of fields.entries()) s.updateField(id, f.id, { width: 320 + i * 120 });
  }, ids);
  await page.waitForTimeout(300);

  // 冻结第 2 个字段列（标题列按规格恒冻结，测的是用户可操作的冻结）
  const secondTh = page.locator(".grid__th-btn").nth(1);
  const secondName = (await secondTh.textContent() ?? "").trim();
  await secondTh.click();
  await page.waitForTimeout(250);
  await page.locator(".menu-item", { hasText: "冻结列" }).click();
  await page.waitForTimeout(400);
  console.log("冻结列 =", secondName);

  const frozenLeftOf = () => page.evaluate(() => {
    const wrap = document.querySelector(".collection__scroll");
    const td = [...wrap.querySelectorAll("td.grid__frozen")]
      .find((el) => el.previousElementSibling?.classList.contains("grid__idx"));
    return td && wrap ? td.getBoundingClientRect().left - wrap.getBoundingClientRect().left : null;
  });
  const frozenCount = () => page.evaluate(() => document.querySelectorAll(".collection__scroll td.grid__frozen").length);
  const scroll = page.locator(".collection__scroll");
  await scroll.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await page.waitForTimeout(300);
  const leftScrolled = await frozenLeftOf();
  if (leftScrolled === null) fail("冻结后找不到冻结单元格");
  await page.screenshot({ path: OUT + "/冻结-滚动中.png" });
  await scroll.evaluate((el) => (el.scrollLeft = 0));
  await page.waitForTimeout(300);
  const leftHome = await frozenLeftOf();
  console.log("冻结单元格 left：滚动后", leftScrolled, "回原点", leftHome);
  if (Math.abs(leftScrolled - leftHome) > 1) fail(`冻结列随滚动位移 ${Math.abs(leftScrolled - leftHome)}px`);
  if (Math.abs(leftScrolled - 66) > 1) fail(`冻结列相对容器偏移应为 66（No. 列宽），实际 ${leftScrolled}`);

  // 视图设置里 frozenFieldIds 持久化确认
  const frozen = await page.evaluate((id) => {
    const s = window.__gf_store.getState();
    const c = s.collections.find((x) => x.id === id);
    return c.views[0].frozenFieldIds;
  }, ids);
  if (!Array.isArray(frozen) || frozen.length !== 1) fail("frozenFieldIds 未持久化: " + JSON.stringify(frozen));

  // 解冻：首列恒冻结，所以冻结单元格数量应回落（少掉每行一个）
  const countWhile = await frozenCount();
  await page.locator(".grid__th-btn").nth(1).click();
  await page.waitForTimeout(250);
  await page.locator(".menu-item", { hasText: "取消冻结列" }).click();
  await page.waitForTimeout(400);
  const countAfter = await frozenCount();
  console.log("冻结单元格数：冻结时", countWhile, "→ 解冻后", countAfter);
  if (countAfter >= countWhile) fail("解冻后冻结单元格数未减少");
  await scroll.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "/解冻-滚动中.png" });
  if (failed === 0) console.log("PASS: 冻结列 开启/钉住/持久化/解冻 全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
