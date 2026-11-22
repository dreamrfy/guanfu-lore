// W111/W113 分享面板点验：真实状态流（GET/POST/DELETE mock）→ 开公开 → 链接展示与复制 → 关闭撤销。
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
const OUT = "../docs/验收证据/重做批/W111";
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
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
};

// 服务端桩：内存里保存分享状态（GET/POST/DELETE 全走真 fetch，只是网络层替换）
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
    /* ignore */
  }
});

let shareState = { url: null };
await page.route("**/api/share**", async (route) => {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  const req = route.request();
  const headers = { ...CORS, "content-type": "application/json" };
  if (req.method() === "GET") {
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({ ok: true, shared: Boolean(shareState.url), url: shareState.url, createdAt: null }),
    });
    return;
  }
  if (req.method() === "POST") {
    shareState = { url: "https://share.guanfu.app/s/W111Token0123456789ab" };
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({ ok: true, token: "W111Token0123456789ab", url: shareState.url, created: true }),
    });
    return;
  }
  shareState = { url: null };
  await route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true, shared: false }) });
});

try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });

  const pageId = await page.evaluate(async () => {
    const id = await window.__gf_store.getState().createPage(null);
    await new Promise((r) => setTimeout(r, 500));
    return id;
  });
  if (!pageId) fail("新建页面失败");

  await page.locator(".toolbar").waitFor({ timeout: 5000 });
  await page.locator('.toolbar .icon-btn[title="分享"]').click();
  const panel = page.locator('[data-testid="share-panel"]');
  await panel.waitFor({ timeout: 5000 });
  await panel.getByText("读取分享状态…").waitFor({ state: "detached", timeout: 5000 });

  // 1) 页签：公开分享选中，邀请协作禁用
  const tabs = panel.locator(".share-tab");
  if ((await tabs.count()) !== 2) fail("分享页签数 ≠ 2");
  if (!(await tabs.nth(1).isDisabled())) fail("邀请协作应禁用");

  // 2) 初始：仅自己
  const badge = panel.locator('[data-testid="share-badge"]');
  if (!(await badge.textContent())?.includes("仅自己")) fail("初始徽章应为「仅自己」");
  const perms = panel.locator(".share-perm");
  if ((await perms.count()) !== 2) fail("权限选项数 ≠ 2");
  if (!((await perms.nth(0).getAttribute("class")) ?? "").includes("share-perm--active")) {
    fail("初始应选中「仅自己」");
  }

  // 3) 开公开 → POST → 徽章「公开」+ 链接行出现
  await perms.nth(1).click();
  await panel.locator('[data-testid="share-linkrow"]').waitFor({ timeout: 5000 });
  if (!(await badge.textContent())?.includes("公开")) fail("开公开后徽章应为「公开」");
  const linkValue = await panel.locator(".share-linkrow input.share-link").inputValue();
  if (!linkValue.startsWith("https://share.guanfu.app/s/")) fail("公开链接不对: " + linkValue);
  await page.screenshot({ path: OUT + "/分享面板-公开.png" });

  // 4) 复制公开链接
  await panel.locator('[data-testid="share-copy"]').click();
  await page.waitForTimeout(300);
  const copied = await page.evaluate(() => window.__copied);
  if (copied !== linkValue) fail("复制公开链接失败: " + copied);

  // 5) 关公开 → DELETE → 链接行消失，徽章回「仅自己」
  await perms.nth(0).click();
  await panel.locator('[data-testid="share-linkrow"]').waitFor({ state: "detached", timeout: 5000 });
  if (!(await badge.textContent())?.includes("仅自己")) fail("关闭后徽章应回「仅自己」");

  // 6) 复制页面链接（菜单项仍在）
  await perms.nth(1).click();
  await panel.locator('[data-testid="share-linkrow"]').waitFor({ timeout: 5000 });
  await panel.getByRole("button", { name: /复制页面链接/ }).click();
  await page.waitForTimeout(300);
  const copiedPage = await page.evaluate(() => window.__copied);
  if (!copiedPage.includes("?page=" + pageId)) fail("复制页面链接失败: " + copiedPage);

  console.log("PASS: 分享面板 状态流/开关/链接/复制/撤销 全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}