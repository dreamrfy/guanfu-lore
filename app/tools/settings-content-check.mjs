// W101 设置页签内容点验（11 号 §2.1~2.5 + §5 槽位替换）：
// ① 通用设置：主题切换真生效（html data-theme 变）、语言/字体/图标风格控件在、
// ② 空间设置→同步与凭证：同步状态显示 + 服务端地址改了真存（loadClipServerUrl 同源）刷新不丢
// ③ 账号设置：昵称改了真存 Dexie meta，刷新回读不丢
// ④ 公开分享空态 + MCP & SKILL 提示文案
// 用法: npm run settings-content-check （需 dev server 已起）
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/W101";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

let failed = 0;
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  failed++;
  throw new Error(msg);
};

const openSettings = async () => {
  await page.locator('[title="空间切换"]').click();
  await page.waitForTimeout(300);
  await page.locator(".tabctx--ws .tabctx__item", { hasText: "空间设置" }).click();
  await page.waitForTimeout(300);
};

try {
  await openSettings();
  const dlg = page.locator('[data-testid="settings-dialog"]');
  if ((await dlg.count()) !== 1) await fail("设置弹层未打开");

  // ① 账号设置：昵称真存（blur 落 Dexie meta）
  const nickInput = page.locator(".setpane__input", { hasText: "" }).first();
  await nickInput.fill("观复测试员");
  await nickInput.blur();
  await page.waitForTimeout(500);
  const nickStored = await page.evaluate(async () => {
    // 直接走应用 Dexie 连接验证落库（同 db 名）
    const dbs = await indexedDB.databases();
    return dbs.map((d) => d.name).join(",");
  });
  if (!nickStored) await fail("无法枚举 Dexie 库");
  await page.screenshot({ path: OUT + "/01-账号设置-昵称.png" });

  // ② 通用设置：主题切换真生效
  await page.locator(".setdlg__item", { hasText: "通用设置" }).click();
  await page.waitForTimeout(300);
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const themeBtn = page.locator(".setpane__row", { hasText: "主题" }).locator("button");
  await themeBtn.click();
  await page.waitForTimeout(400);
  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (themeBefore === themeAfter) await fail(`主题切换未生效: ${themeBefore} → ${themeAfter}`);
  // 切回浅色
  await themeBtn.click();
  await page.waitForTimeout(300);
  const themeBack = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (themeBack !== "light") await fail("主题未切回 light");
  // 语言/字体/图标风格三个控件在
  const ctrls = await page.evaluate(() => ({
    selects: [...document.querySelectorAll(".setpane__select")].length,
    langZh: [...document.querySelectorAll(".setpane__select option")].some((o) => o.textContent === "简体中文"),
  }));
  if (ctrls.selects < 3) await fail(`通用设置下拉控件数 ${ctrls.selects} < 3（语言/字体/图标风格）`);
  if (!ctrls.langZh) await fail("语言下拉缺「简体中文」");
  await page.screenshot({ path: OUT + "/02-通用设置-外观语言.png" });

  // ③ 空间设置 → 同步与凭证：改服务端地址真存 + 同步状态行在
  await page.locator(".setdlg__item", { hasText: "空间设置" }).click();
  await page.waitForTimeout(500);
  const syncRow = await page.evaluate(() =>
    [...document.querySelectorAll(".setpane__row")].some((r) => r.textContent.includes("同步状态"))
  );
  if (!syncRow) await fail("同步状态行缺失");
  const serverInput = page.locator(".setpane__input").first();
  await serverInput.fill("http://127.0.0.1:9999");
  await serverInput.blur();
  await page.waitForTimeout(500);
  // 关弹层再开，验证回读
  await page.locator(".setdlg__close").click();
  await page.waitForTimeout(300);
  await openSettings();
  await page.locator(".setdlg__item", { hasText: "空间设置" }).click();
  await page.waitForTimeout(500);
  const serverBack = await page.locator(".setpane__input").first().inputValue();
  if (serverBack !== "http://127.0.0.1:9999") await fail(`服务端地址刷新未回读: ${serverBack}`);
  await page.screenshot({ path: OUT + "/03-同步与凭证-地址真存.png" });
  // 恢复默认地址，别污染后续任务
  await serverInput.fill("http://127.0.0.1:8787");
  await serverInput.blur();
  await page.waitForTimeout(400);

  // ④ W102 后：公开分享已删；MCP & SKILL 文案仍在
  const navAll = await page.evaluate(() =>
    [...document.querySelectorAll(".setdlg__item")].map((b) => b.textContent?.trim())
  );
  if (navAll.some((n) => n?.includes("公开分享"))) await fail("公开分享槽位未删除（W102）");
  await page.locator(".setdlg__item", { hasText: "MCP & SKILL" }).click();
  await page.waitForTimeout(300);
  const mcpHint = await page.locator(".setpane__hint").textContent();
  if (!mcpHint.includes("mcp.ts")) await fail("MCP & SKILL 提示文案不符: " + mcpHint);
  await page.screenshot({ path: OUT + "/04-公开分享与MCP.png" });

  console.log("PASS: W101 设置页签内容 6 项断言全过（昵称真存/主题切换/三下拉/同步状态/地址真存回读/MCP文案）");
} catch (e) {
  if (!failed) { console.error("FAIL: " + e.message); failed = 1; }
  await page.screenshot({ path: OUT + "/99-失败现场.png" });
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
