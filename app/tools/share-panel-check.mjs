// W110 分享面板点验：入口 → 面板形态 → 页签/权限选项 → 复制页面链接。
// 用法: npm run share-panel-check （需 dev server 已起）
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
const OUT = "../docs/验收证据/重做批/W110";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
let failed = 0;
const fail = (msg) => {
  console.error("FAIL: " + msg);
  failed++;
  throw new Error(msg);
};

await page.addInitScript(() => {
  window.__copied = "";
  const clipboard = {
    writeText: async (t) => {
      window.__copied = String(t);
    },
    readText: async () => "",
  };
  try {
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  } catch {
    try {
      Object.defineProperty(Navigator.prototype, "clipboard", { get: () => clipboard, configurable: true });
    } catch {
      /* ignore */
    }
  }
});

try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });

  // 建一个页面，顶栏才会出现
  const pageId = await page.evaluate(async () => {
    const id = await window.__gf_store.getState().createPage(null);
    await new Promise((r) => setTimeout(r, 500));
    return id;
  });
  if (!pageId) fail("新建页面失败");

  await page.locator(".toolbar").waitFor({ timeout: 5000 });
  await page.locator('.toolbar .icon-btn[title="分享"]').waitFor({ timeout: 5000 });
  await page.locator('.toolbar .icon-btn[title="分享"]').click();
  const panel = page.locator('[data-testid="share-panel"]');
  await panel.waitFor({ timeout: 5000 });

  // 1) 页签：公开分享选中，邀请协作禁用
  const tabs = panel.locator(".share-tab");
  if ((await tabs.count()) !== 2) fail("分享页签数 ≠ 2");
  if (!(await tabs.nth(0).getAttribute("aria-selected"))?.includes("true")) fail("公开分享未选中");
  if (!(await tabs.nth(1).isDisabled())) fail("邀请协作应禁用（观复不做协作）");

  // 2) 公开分享 + 待接入 + 权限选项
  const panelText = (await panel.textContent()) ?? "";
  if (!panelText.includes("公开分享") || !panelText.includes("待接入")) fail("公开分享区缺内容");
  const perms = panel.locator(".share-perm");
  if ((await perms.count()) !== 2) fail("权限选项数 ≠ 2");
  if (!((await perms.nth(0).getAttribute("class")) ?? "").includes("share-perm--active")) {
    fail("「仅自己」未选中");
  }
  if (!(await perms.nth(1).isDisabled())) fail("「获得链接的人」应待接入禁用");
  await page.screenshot({ path: OUT + "/分享面板.png" });

  // 3) 复制页面链接
  await panel.getByRole("button", { name: /复制页面链接/ }).click();
  await page.waitForTimeout(300);
  const copied = await page.evaluate(() => window.__copied);
  if (!copied.includes("?page=" + pageId)) fail("复制的链接不对: " + copied);
  if ((await page.locator('[data-testid="share-panel"]').count()) !== 0) fail("复制后面板应收起");

  // 4) 再开一次 → 点外部关闭
  await page.locator('.toolbar .icon-btn[title="分享"]').click();
  await panel.waitFor({ timeout: 3000 });
  await page.mouse.click(20, 400);
  await page.waitForTimeout(300);
  if ((await page.locator('[data-testid="share-panel"]').count()) !== 0) fail("点外部未关闭分享面板");

  console.log("PASS: 分享面板 入口/页签/权限选项/复制链接/外部关闭 全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}