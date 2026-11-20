// W123 剪藏全链走查：剪贴板提示 → 收进��成功 → 打开记录 → 打开离线快照 → 收集箱列表 → 行打开。
// 剪贴板/剪藏服务用桩；其余全是真实 UI + 真实 Dexie/附件存储。
// 用法: npm run clip-walkthrough （需 dev server 已起）
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
const OUT = "../docs/验收证据/重做批/W123";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
let failed = 0;
const fail = (msg) => {
  console.error("FAIL: " + msg);
  failed++;
  throw new Error(msg);
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "POST,OPTIONS",
};

await page.addInitScript(() => {
  window.__clipText = "https://mp.weixin.qq.com/s/walkthrough?from=timeline";
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  const clipboard = { readText: async () => window.__clipText, writeText: async () => {} };
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

await page.route("**/api/clip", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  let url = "";
  try {
    url = route.request().postDataJSON()?.url ?? "";
  } catch {
    /* ignore */
  }
  await route.fulfill({
    status: 200,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      clip: {
        id: "clip-walkthrough",
        source: "wechat_mp",
        sourceUrl: url,
        canonicalUrl: url,
        title: "全链走查：观复剪藏",
        author: "观复测试",
        account: "观复",
        publishedAt: null,
        savedAt: new Date().toISOString(),
        text: "这是剪藏正文，用来验证入库、收集箱与离线快照。",
        status: "ok",
      },
      contentHtml: "<p>这是剪藏正文，用来验证入库、收集箱与离线快照。</p>",
      snapshotHtml:
        "<!doctype html><html><body><h1>全链走查：观复剪藏</h1><p id=\"snapshot-marker\">快照正文：观复全链走查</p></body></html>",
      assets: [],
    }),
  });
});

try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store), null, { timeout: 15000 });
  await page.getByText("快速剪藏", { exact: true }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);

  // 1) 入库入口：剪贴板提示
  await page.locator('[data-testid="clip-banner"]').waitFor({ timeout: 5000 });
  await page.screenshot({ path: OUT + "/01-剪贴板提示.png" });

  // 2) 收进 → 成功面板
  await page.locator('[data-testid="clip-banner"]').getByRole("button", { name: "收进", exact: true }).click();
  const success = page.locator('[data-testid="clip-success"]');
  await success.waitFor({ timeout: 10000 });
  if (!((await success.textContent()) ?? "").includes("全链走查：观复剪藏")) {
    fail("成功面板标题不对");
  }
  await page.screenshot({ path: OUT + "/02-入库成功.png" });

  // 3) 打开记录详情
  await success.getByRole("button", { name: "打开" }).click();
  await page.locator(".record__title").first().waitFor({ timeout: 5000 });
  const title = await page.locator(".record__title").first().inputValue();
  if (title !== "全链走查：观复剪藏") fail("记录标题不对: " + title);
  await page.waitForTimeout(500);
  const bodyText = (await page.locator(".record__body").first().innerText().catch(() => "")) || "";
  if (!bodyText.includes("这是剪藏正文")) fail("记录正文没有入库内容: " + bodyText);
  await page.screenshot({ path: OUT + "/03-记录详情.png" });

  // 4) 打开离线快照（新窗口 blob）
  const popupPromise = page.waitForEvent("popup", { timeout: 8000 });
  await page.getByRole("link", { name: "打开快照" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  const snapshotText = await popup.locator("body").innerText().catch(() => "");
  if (!snapshotText.includes("快照正文：观复全链走查")) fail("快照内容不对: " + snapshotText);
  await popup.screenshot({ path: OUT + "/04-打开快照.png" });
  await popup.close();

  // 5) 回到收集箱列表：待整理里能看到这条
  await page.locator(".panel__close").click();
  await page.waitForTimeout(300);
  await page.locator(".shell__sidebar").getByText("剪藏库", { exact: true }).click();
  await page.locator(".clipinbox").waitFor({ timeout: 5000 });
  // 收起右侧「页面信息」空面板，收集箱列表截图保持干净
  await page.evaluate(() => window.__gf_store.getState().setRightPanelOpen(false));
  await page.waitForTimeout(300);
  await page.locator(".clipinbox__tab", { hasText: "待整理" }).click();
  await page.waitForTimeout(300);
  const rowCount = await page
    .locator(".collection__scroll tbody tr")
    .evaluateAll((rows) => rows.filter((r) => r.querySelector(".grid__idx")).length);
  if (rowCount !== 1) fail("待整理应有 1 条，实际 " + rowCount);
  const listText = (await page.locator(".collection__scroll").innerText()) || "";
  if (!listText.includes("全链走查：观复剪藏")) fail("收集箱列表没有这条剪藏");
  await page.screenshot({ path: OUT + "/05-收集箱列表.png" });

  // 6) 从列表点行 → 记录详情再次打开
  await page.locator(".collection__scroll tbody .grid__idx").first().click();
  await page.locator(".record__title").first().waitFor({ timeout: 5000 });
  const title2 = await page.locator(".record__title").first().inputValue();
  if (title2 !== "全链走查：观复剪藏") fail("列表打开标题不对: " + title2);

  console.log("PASS: 剪藏全链 6 步（提示/入库/记录/快照/收集箱/列表打开）全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}