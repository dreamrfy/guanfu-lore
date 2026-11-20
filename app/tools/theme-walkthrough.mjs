// W131 深浅双主题全量走查：8 个模块 × 浅/深各一张截图 + 主题属性/关键表面颜色校验。
// 用法: npm run theme-walkthrough （需 dev server 已起）
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("未找到 Chrome");
  process.exit(2);
}
const OUT = "../docs/验收证据/重做批/W131";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
let failed = 0;
const fail = (msg) => {
  console.error("FAIL: " + msg);
  failed++;
  throw new Error(msg);
};

const setTheme = async (theme) => {
  await page.evaluate((t) => window.__gf_store.getState().setTheme(t), theme);
  await page.waitForTimeout(450);
  const actual = await page.evaluate(() => document.documentElement.dataset.theme);
  if (actual !== theme) fail(`主题未切到 ${theme}，实际 ${actual}`);
};

const surfaceStyles = async (selectors) =>
  page.evaluate((sels) => {
    const out = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      out[sel] = `${cs.backgroundColor}|${cs.color}|${cs.borderColor}`;
    }
    return out;
  }, selectors);

/** 浅/深各截一张，并确认关键表面颜色确实发生变化 */
const pair = async (name, selectors) => {
  // 收起右侧「页面信息」空面板，截图只保留当前模块
  await page.evaluate(() => window.__gf_store.getState().setRightPanelOpen(false));
  await page.waitForTimeout(250);
  await setTheme("light");
  const light = await surfaceStyles(selectors);
  await page.screenshot({ path: `${OUT}/${name}-浅色.png` });

  await setTheme("dark");
  const dark = await surfaceStyles(selectors);
  await page.screenshot({ path: `${OUT}/${name}-深色.png` });

  const keys = Object.keys(light).filter((k) => light[k] !== dark[k]);
  if (keys.length === 0) fail(`${name} 深色没有任何关键表面颜色变化（检查选择器/深色覆盖）`);
  console.log(`  ${name}: ${keys.length} 个表面随主题变化`);
  await setTheme("light");
};

try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });

  const ids = await page.evaluate(async () => {
    const s = () => window.__gf_store.getState();
    const pageId = await s().createPage(null);
    await new Promise((r) => setTimeout(r, 300));
    s().renamePage(pageId, "双主题走查页面");
    const tableId = await s().createCollection("双主题走查表");
    await new Promise((r) => setTimeout(r, 300));
    const table = s().collections.find((c) => c.id === tableId);
    const titleField = table.fields.find((f) => f.type === "text");
    for (const title of ["第一条记录", "第二条记录", "第三条记录"]) {
      const rid = await s().addRecord(tableId);
      s().setCell(tableId, rid, titleField.id, title);
    }
    const clip = await s().ensureClipCollection();
    const byName = Object.fromEntries(clip.fields.map((f) => [f.name, f]));
    const opt = (name, value) => byName[name]?.options?.find((o) => o.name === value)?.id ?? value;
    for (const [title, status] of [["微信剪藏：第一条", "未读"], ["微信剪藏：第二条", "已读"]]) {
      const rid = await s().addRecord(clip.id);
      s().setCell(clip.id, rid, byName["标题"].id, title);
      s().setCell(clip.id, rid, byName["状态"].id, opt("状态", status));
    }
    return { pageId, tableId, clipId: clip.id };
  });

  // 01 首页
  await page.evaluate((home) => window.__gf_store.getState().openTab(home), "__home__");
  await page.locator(".homeai").waitFor({ timeout: 5000 });
  await pair("01-首页", [".homeai", ".shell__sidebar", ".shell__main"]);

  // 02 页面与编辑器
  await page.evaluate((id) => window.__gf_store.getState().openTab(id), ids.pageId);
  await page.locator(".page").waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  await pair("02-页面与编辑器", [".page", ".page__inner", ".shell__sidebar", ".bn-editor"]);

  // 03 多维表
  await page.evaluate((id) => window.__gf_store.getState().openCollection(id), ids.tableId);
  await page.locator(".collection").waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await pair("03-多维表", [".collection", ".grid", ".shell__sidebar"]);

  // 04 收集箱
  await page.evaluate((id) => window.__gf_store.getState().openCollection(id), ids.clipId);
  await page.locator(".clipinbox").waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await pair("04-收集箱", [".collection", ".clipinbox", ".shell__sidebar"]);

  // 05 搜索
  await page.keyboard.press("Control+P");
  await page.locator(".searchpanel__card").waitFor({ timeout: 5000 });
  await pair("05-搜索", [".searchpanel__card", ".searchpanel__input", ".shell__sidebar"]);
  await page.keyboard.press("Escape");
  await page.locator(".searchpanel__card").waitFor({ state: "detached", timeout: 3000 });

  // 06 AI 面板
  await page.evaluate(() => window.__gf_store.getState().setAiPanelOpen(true));
  await page.locator(".shell__ai").waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await pair("06-AI面板", [".shell__ai", ".ai__panel", ".shell__main"]);
  await page.evaluate(() => window.__gf_store.getState().setAiPanelOpen(false));

  // 07 设置
  await page.locator('[title="空间切换"]').click();
  await page.waitForTimeout(300);
  await page.locator(".tabctx--ws .tabctx__item", { hasText: "空间设置" }).click();
  await page.locator('[data-testid="settings-dialog"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await pair("07-设置", [".setdlg__card", ".setdlg__nav", ".settings__content"]);
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="settings-dialog"]').waitFor({ state: "detached", timeout: 3000 });

  // 08 分享面板
  await page.evaluate((id) => window.__gf_store.getState().openTab(id), ids.pageId);
  await page.locator(".page").waitFor({ timeout: 5000 });
  await page.locator('.toolbar .icon-btn[title="分享"]').click();
  await page.locator('[data-testid="share-panel"]').waitFor({ timeout: 5000 });
  await pair("08-分享面板", [".share-popover", ".share-public", ".share-tabs"]);
  await page.mouse.click(20, 400);

  console.log("PASS: 8 模块 × 浅/深 双主题走查完成（16 张截图）");
} catch (e) {
  failed++;
  await page.screenshot({ path: `${OUT}/失败现场.png` }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}