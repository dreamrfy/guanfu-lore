// W122 剪贴板入口点验：首页顶部检测到微信/B站链接 → 收进 → 真实入库；忽略后不再提示。
// 剪贴板用 initScript 桩；剪藏服务用 route 模拟（真实 UI + 真实 Dexie 入库）。
// 用法: npm run clip-banner-check （需 dev server 已起）
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
const OUT = "../docs/验收证据/重做批/W122";
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
  window.__clipText = "https://mp.weixin.qq.com/s/banner-first?from=timeline";
  try {
    localStorage.clear();
  } catch {
    /* about:blank 下可能不可用 */
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
        id: "clip-banner",
        source: "wechat_mp",
        sourceUrl: url,
        canonicalUrl: url,
        title: "剪贴板收进的文章",
        author: "观复测试",
        account: "",
        publishedAt: null,
        savedAt: new Date().toISOString(),
        text: "这是剪贴板入口的测试正文。",
        status: "ok",
      },
      contentHtml: "<p>这是剪贴板入口的测试正文。</p>",
      snapshotHtml: "<!doctype html><html><body><p>这是剪贴板入口的测试正文。</p></body></html>",
      assets: [],
    }),
  });
});

const banner = () => page.locator('[data-testid="clip-banner"]');
const dialog = () => page.locator('[data-testid="clip-dialog"]');
const clipTitles = async () =>
  page.evaluate(() => {
    const s = window.__gf_store.getState();
    const c = s.collections.find((x) => x.name === "剪藏库");
    if (!c) return [];
    const f = c.fields.find((x) => x.name === "标题") ?? c.fields[0];
    return (s.records[c.id] ?? []).map((r) => String(r.values[f.id] ?? ""));
  });

try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store), null, { timeout: 15000 });
  await page.getByText("快速剪藏", { exact: true }).waitFor({ timeout: 8000 });

  // 1) 首页顶部出现剪贴板提示
  await banner().waitFor({ timeout: 5000 });
  const text = (await banner().textContent()) ?? "";
  if (!text.includes("检测到链接，收进收集箱")) fail("提示条文案不对: " + text);
  if (!text.includes("mp.weixin.qq.com/s/banner-first")) fail("提示条没有显示链接: " + text);
  await page.screenshot({ path: OUT + "/剪贴板提示.png" });

  // 2) 点「收进」→ 弹层自动抓取 → 成功面板 → 真实入库
  await banner().getByRole("button", { name: "收进", exact: true }).click();
  await dialog().waitFor({ timeout: 5000 });
  await page.locator('[data-testid="clip-success"]').waitFor({ timeout: 10000 });
  const titles = await clipTitles();
  if (!titles.includes("剪贴板收进的文章")) fail("剪贴板收进没有真实入库: " + JSON.stringify(titles));
  await page.screenshot({ path: OUT + "/收进成功.png" });
  await dialog().getByRole("button", { name: "关闭" }).click();
  await dialog().waitFor({ state: "detached", timeout: 3000 });
  if ((await banner().count()) !== 0) fail("收进后提示条应消失");

  // 3) 新链接 → 忽略 → 再聚焦不再提示
  await page.evaluate(() => {
    window.__clipText = "https://mp.weixin.qq.com/s/banner-ignore?from=timeline";
    window.dispatchEvent(new Event("focus"));
  });
  await banner().waitFor({ timeout: 5000 });
  await banner().getByRole("button", { name: "忽略", exact: true }).click();
  await banner().waitFor({ state: "detached", timeout: 3000 });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(700);
  if ((await banner().count()) !== 0) fail("忽略后再次聚焦不应再提示");

  // 4) 普通网页不提示
  await page.evaluate(() => {
    window.__clipText = "https://example.com/not-a-clip";
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(700);
  if ((await banner().count()) !== 0) fail("普通网页不应出现剪贴板提示");

  console.log("PASS: 剪贴板提示/收进/真实入库/忽略/普通网页 全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}