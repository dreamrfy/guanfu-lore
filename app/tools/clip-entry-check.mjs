// W121 剪藏入口点验：Ctrl+Shift+V 唤起 → 抓取 → 成功/继续/重复/失败 → 打开记录。
// 剪藏服务用 Playwright route 模拟（真实 UI + 真实 Dexie 入库；服务端链路另有自测）。
// 用法: npm run clip-entry-check （需 dev server 已起）
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
const OUT = "../docs/验收证据/重做批/W121";
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
  if (url.includes("fail")) {
    await route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({ ok: false, code: "fetch_failed", error: "测试：抓取失败" }),
    });
    return;
  }
  const title = url.includes("second") ? "第二篇测试文章" : "第一篇测试文章";
  await route.fulfill({
    status: 200,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      clip: {
        id: "clip-" + (url.includes("second") ? "second" : "first"),
        source: "other",
        sourceUrl: url,
        canonicalUrl: url,
        title,
        author: "观复测试",
        account: "",
        publishedAt: null,
        savedAt: new Date().toISOString(),
        text: "这是测试正文。",
        status: "ok",
      },
      contentHtml: "<p>这是测试正文。</p>",
      snapshotHtml: "<!doctype html><html><body><h1></h1><p>这是测试正文。</p></body></html>",
      assets: [],
    }),
  });
});

const dialog = () => page.locator('[data-testid="clip-dialog"]');
const input = () => dialog().locator(".clip-input").first();
const clipList = async () =>
  page.evaluate(() => {
    const s = window.__gf_store.getState();
    const c = s.collections.find((x) => x.name === "剪藏库");
    if (!c) return [];
    const titleField = c.fields.find((f) => f.name === "标题") ?? c.fields[0];
    return (s.records[c.id] ?? []).map((r) => String(r.values[titleField.id] ?? ""));
  });

try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store), null, { timeout: 15000 });
  // 等 React effect 挂好（快捷键监听与 ClipButton 的 gf:open-clip-dialog 监听都在 effect 里）
  await page.getByText("快速剪藏", { exact: true }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);

  // 1) 快捷键唤起（先把焦点从 AI 输入框挪开，否则全局快捷键按规格让给输入框）
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });
  // Chrome/WebView2 会把 Ctrl+Shift+V 吞成“粘贴为纯文本”，真实按键到不了页面；
  // 桌面浏览器可用 Ctrl+Alt+V。两者都验：真实按键走 Ctrl+Alt+V，合成事件走 Ctrl+Shift+V。
  await page.keyboard.press("Control+Alt+V");
  await dialog().waitFor({ timeout: 5000 });
  if (!(await dialog().isVisible())) fail("Ctrl+Alt+V 没有唤起剪藏弹层");
  await page.keyboard.press("Escape");
  await dialog().waitFor({ state: "detached", timeout: 3000 });
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true })),
  );
  await dialog().waitFor({ timeout: 3000 });
  if (!(await dialog().isVisible())) fail("Ctrl+Shift+V 处理器没有唤起剪藏弹层");

  // 2) 抓取成功 → 成功面板
  await input().fill("https://mp.weixin.qq.com/s/test-first");
  await dialog().getByRole("button", { name: "剪藏", exact: true }).click();
  const success = page.locator('[data-testid="clip-success"]');
  await success.waitFor({ timeout: 10000 });
  const successText = (await success.textContent()) ?? "";
  if (!successText.includes("已收进收集箱") || !successText.includes("第一篇测试文章")) {
    fail("成功面板文案不对: " + successText);
  }
  if (!(await success.getByRole("button", { name: "打开" }).isVisible())) fail("成功面板缺少「打开」");
  if (!(await success.getByRole("button", { name: "继续" }).isVisible())) fail("成功面板缺少「继续」");
  const afterFirst = await clipList();
  if (!afterFirst.includes("第一篇测试文章")) fail("真实入库失败，剪藏库没有第一篇记录: " + JSON.stringify(afterFirst));
  await page.screenshot({ path: OUT + "/成功面板.png" });

  // 3) 继续 → 同链接再剪 → 重复提示（不再请求服务）
  await success.getByRole("button", { name: "继续" }).click();
  await input().waitFor({ timeout: 3000 });
  await input().fill("https://mp.weixin.qq.com/s/test-first");
  await dialog().getByRole("button", { name: "剪藏", exact: true }).click();
  const duplicate = page.locator('[data-testid="clip-duplicate"]');
  await duplicate.waitFor({ timeout: 5000 });
  const duplicateText = (await duplicate.textContent()) ?? "";
  if (!duplicateText.includes("已经在收集箱里")) fail("重复提示文案不对: " + duplicateText);
  if ((await clipList()).length !== 1) fail("重复剪藏不应新增记录");
  await page.screenshot({ path: OUT + "/重复提示.png" });

  // 4) 继续 → 失败链接 → 失败面板 + 重试/打开原文
  await duplicate.getByRole("button", { name: "继续" }).click();
  await input().waitFor({ timeout: 3000 });
  await input().fill("https://x.test/fail");
  await dialog().getByRole("button", { name: "剪藏", exact: true }).click();
  const error = page.locator('[data-testid="clip-error"]');
  await error.waitFor({ timeout: 5000 });
  const errorText = (await error.textContent()) ?? "";
  if (!errorText.includes("抓取失败")) fail("失败面板没有显示错误: " + errorText);
  if (!(await error.getByRole("button", { name: "重试" }).isVisible())) fail("失败面板缺少「重试」");
  if (!(await error.getByRole("button", { name: "打开原文" }).isVisible())) fail("失败面板缺少「打开原文」");
  await page.screenshot({ path: OUT + "/失败面板.png" });

  // 5) 回到成功记录，点「打开」→ 弹层关、记录详情打开
  await error.getByRole("button", { name: "打开原文" }).isVisible();
  await page.keyboard.press("Escape");
  await dialog().waitFor({ state: "detached", timeout: 3000 });
  await page.keyboard.press("Control+Alt+V");
  await dialog().waitFor({ timeout: 3000 });
  await input().fill("https://mp.weixin.qq.com/s/test-first");
  await dialog().getByRole("button", { name: "剪藏", exact: true }).click();
  await page.locator('[data-testid="clip-duplicate"]').waitFor({ timeout: 5000 });
  await page.locator('[data-testid="clip-duplicate"]').getByRole("button", { name: "打开" }).click();
  await dialog().waitFor({ state: "detached", timeout: 5000 });
  await page.waitForTimeout(500);
  const titleValue = await page.locator(".record__title").first().inputValue().catch(async () => {
    return (await page.locator(".record__title").first().textContent()) ?? "";
  });
  if (!String(titleValue).includes("第一篇测试文章")) fail("打开后记录详情标题不对: " + titleValue);

  console.log("PASS: 剪藏入口 快捷键/成功/入库/继续/重复/失败/打开 全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}