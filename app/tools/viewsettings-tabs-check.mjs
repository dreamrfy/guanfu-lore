// W69 补齐点验：视图设置 属性/筛选/排序/分组/子记录 五页签真实接入
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
const CHROME_PATHS = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/W69补齐";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
let failed = 0;
const fail = (m) => { console.error("FAIL: " + m); failed++; throw new Error(m); };
try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });
  await page.evaluate(async () => {
    const s = window.__gf_store.getState();
    const id = await s.createCollection("视图设置五页签");
    for (let i = 0; i < 2; i++) await s.addRecord(id);
    await window.__gf_store.getState().openCollection(id);
  });
  await page.locator(".collection").waitFor({ timeout: 5000 });

  const openSettings = async () => {
    await page.locator(".viewtab__menu").first().click();
    await page.waitForTimeout(250);
    await page.locator(".viewtab__pop .menu-item", { hasText: "视图设置" }).click();
    await page.locator(".viewsettings").waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
  };

  // 1) 属性页签：字段行数 = 2；隐藏第二列 → 网格列数变化；恢复
  await openSettings();
  await page.locator(".viewsettings__tab", { hasText: "属性" }).click();
  await page.waitForTimeout(200);
  const fields = await page.locator(".vs-field").count();
  if (fields !== 2) fail("属性页签字段行数 ≠ 2: " + fields);
  const gridCols = () => page.evaluate(() => document.querySelectorAll(".collection__scroll thead th:not(.grid__add):not(.grid__idx--head)").length);
  const before = await gridCols();
  await page.locator(".vs-field__show input").nth(1).uncheck();
  await page.waitForTimeout(300);
  const afterHide = await gridCols();
  if (afterHide !== before - 1) fail(`隐藏列后网格列数未减一: ${before}→${afterHide}`);
  await page.locator(".vs-field__show input").nth(1).check();
  await page.waitForTimeout(300);
  if ((await gridCols()) !== before) fail("恢复显示后网格列数未还原");
  await page.locator(".vs-fields__add").click();
  await page.waitForTimeout(400);
  if ((await page.locator(".vs-field").count()) !== 3) fail("创建新属性后行数 ≠ 3");
  await page.screenshot({ path: OUT + "/属性页签.png" });
  await page.evaluate(() => document.querySelector(".viewsettings__close")?.click());
  await page.waitForTimeout(300);

  // 2) 筛选页签：面板渲染 + 添加条件 + 真生效（视图栏显示 筛选·1）
  await openSettings();
  await page.locator(".viewsettings__tab", { hasText: "筛选" }).click();
  await page.waitForTimeout(200);
  if (!(await page.locator(".viewsettings .viewpop .seg__btn").count())) fail("筛选面板未渲染");
  await page.locator(".viewsettings .viewpop button", { hasText: "＋ 添加条件" }).click();
  await page.waitForTimeout(200);
  await page.locator(".viewsettings .viewpop .cond").first().locator("select").first().selectOption({ index: 0 });
  await page.waitForTimeout(200);
  // 提交条件值（第一字段是文本）
  await page.locator(".viewsettings .viewpop .cond__value").first().fill("无匹配值xyz");
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector(".viewsettings__close")?.click());
  await page.waitForTimeout(300);
  const bar = (await page.locator(".viewbar").innerText()) || "";
  if (!bar.includes("筛选 · 1")) fail("筛选未生效到视图栏: " + bar);
  // 行数应为 0（文本不含无匹配值xyz）——恢复：清空筛选
  await page.evaluate(() => {
    const s = window.__gf_store.getState();
    const c = s.collections.find((x) => x.views[0].filters?.length);
    if (c) s.updateView(c.id, c.views[0].id, { filters: [] });
  });
  await page.waitForTimeout(300);

  // 3) 排序页签：添加排序 → 视图栏显示 排序·1
  await openSettings();
  await page.locator(".viewsettings__tab", { hasText: "排序" }).click();
  await page.waitForTimeout(200);
  await page.locator(".viewsettings .viewpop button", { hasText: "＋ 添加排序" }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector(".viewsettings__close")?.click());
  await page.waitForTimeout(300);
  const bar2 = (await page.locator(".viewbar").innerText()) || "";
  if (!bar2.includes("排序 · 1")) fail("排序未生效到视图栏: " + bar2);
  await page.evaluate(() => {
    const s = window.__gf_store.getState();
    const c = s.collections.find((x) => x.views[0].sorts?.length);
    if (c) s.updateView(c.id, c.views[0].id, { sorts: [] });
  });
  await page.waitForTimeout(300);

  // 4) 分组页签：选分组字段 → 视图栏显示分组 + 网格出现组头
  await openSettings();
  await page.locator(".viewsettings__tab", { hasText: "分组" }).click();
  await page.waitForTimeout(200);
  const groupItems = await page.locator(".viewsettings .viewpop .viewpop__choice").count();
  if (!groupItems) fail("分组面板未渲染");
  await page.locator(".viewsettings .viewpop .viewpop__choice", { hasText: "标题" }).first().click();
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector(".viewsettings__close")?.click());
  await page.waitForTimeout(400);
  const hasGroup = await page.locator(".grid__group, .grid__grouprow, .grid__group-count").first().count().catch(() => 0);
  if (!hasGroup) fail("分组未生效（网格无组头）");
  await page.screenshot({ path: OUT + "/分组生效.png" });

  // 5) 子记录页签：诚实暂定文案
  await openSettings();
  await page.locator(".viewsettings__tab", { hasText: "子记录" }).click();
  await page.waitForTimeout(200);
  const childText = (await page.locator(".viewsettings__body").innerText()) || "";
  if (!childText.includes("未取到内容")) fail("子记录页签缺少诚实暂定说明");
  await page.evaluate(() => document.querySelector(".viewsettings__close")?.click());

  if (failed === 0) console.log("PASS: 视图设置五页签 属性/筛选/排序/分组/子记录 全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
