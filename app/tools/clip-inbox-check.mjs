// W120 收集箱页点验：状态页签（全部/待整理/已归档/失败）+ 本地搜索 + 组合筛选 + 截图。
// 用法: npm run clip-inbox-check （需 dev server 已起）
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
const OUT = "../docs/验收证据/重做批/W120";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForFunction(() => Boolean(window.__gf_store), null, { timeout: 15000 });

let failed = 0;
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  failed++;
  throw new Error(msg);
};

const rowCount = async () =>
  page.locator(".collection__scroll tbody tr").evaluateAll(
    (rows) => rows.filter((r) => r.querySelector(".grid__idx")).length,
  );

try {
  // 1) 造 4 条剪藏：2 条未读、1 条已读、1 条失败
  const seeded = await page.evaluate(async () => {
    const store = window.__gf_store.getState();
    const collection = await store.ensureClipCollection();
    const existing = window.__gf_store.getState().records[collection.id] ?? [];
    for (const r of existing) await window.__gf_store.getState().removeRecord(collection.id, r.id);
    const byName = Object.fromEntries(collection.fields.map((f) => [f.name, f]));
    const opt = (field, name) => field?.options?.find((o) => o.name === name)?.id ?? name;
    const add = async (title, status, author, url, source) => {
      const values = {
        [byName["标题"].id]: title,
        [byName["作者"].id]: author,
        [byName["原文链接"].id]: url,
        [byName["收藏时间"].id]: Date.now(),
        [byName["来源"].id]: opt(byName["来源"], source),
        [byName["状态"].id]: opt(byName["状态"], status),
      };
      return window.__gf_store.getState().addClipRecord(collection.id, values, [], null);
    };
    await add("微信：AI 提效实践", "未读", "老猪", "https://mp.weixin.qq.com/s/a", "公众号");
    await add("微信：长文阅读方法", "未读", "张三", "https://mp.weixin.qq.com/s/b", "公众号");
    await add("B站：知识管理入门", "已读", "李四", "https://www.bilibili.com/video/BV1xx", "B站");
    await add("抓取失败的链接", "失败", "", "https://x.test/fail", "其他");
    await window.__gf_store.getState().openCollection(collection.id);
    return { collectionId: collection.id };
  });
  if (!seeded.collectionId) await fail("剪藏库未建立");

  await page.waitForSelector(".clipinbox", { timeout: 10000 });
  await page.waitForSelector(".collection__scroll tbody tr", { timeout: 10000 });
  await page.waitForTimeout(400);

  // 2) 页签与计数
  const tabs = await page.locator(".clipinbox__tab").allTextContents();
  if (tabs.length !== 4) await fail("页签数 ≠ 4: " + JSON.stringify(tabs));
  const counts = tabs.map((s) => Number(s.replace(/[^\d]/g, "")));
  if (counts.join(",") !== "4,2,1,1") await fail("计数 ≠ 全部4/待整理2/已归档1/失败1: " + counts.join(","));
  if ((await rowCount()) !== 4) await fail("全部行数 ≠ 4");

  // 3) 待整理页签
  await page.locator(".clipinbox__tab", { hasText: "待整理" }).click();
  await page.waitForTimeout(300);
  if ((await rowCount()) !== 2) await fail("待整理行数 ≠ 2");

  // 4) 搜索叠加：待整理 + B站 → 0；清空 → 2
  const search = page.locator(".clipinbox__search input");
  await search.fill("B站");
  await page.waitForTimeout(300);
  if ((await rowCount()) !== 0) await fail("待整理+B站 应为 0");
  await search.fill("");
  await page.waitForTimeout(300);
  if ((await rowCount()) !== 2) await fail("清空搜索后待整理应回到 2");

  // 5) 已归档 / 失败
  await page.locator(".clipinbox__tab", { hasText: "已归档" }).click();
  await page.waitForTimeout(300);
  if ((await rowCount()) !== 1) await fail("已归档行数 ≠ 1");
  await page.locator(".clipinbox__tab", { hasText: "失败" }).click();
  await page.waitForTimeout(300);
  if ((await rowCount()) !== 1) await fail("失败行数 ≠ 1");

  // 6) 全部 + 搜索“微信” → 2
  await page.locator(".clipinbox__tab", { hasText: "全部" }).click();
  await search.fill("微信");
  await page.waitForTimeout(300);
  if ((await rowCount()) !== 2) await fail("全部+微信 应为 2");

  // 7) 无结果空态
  await search.fill("不存在的关键词");
  await page.waitForTimeout(300);
  const emptyText = (await page.locator(".grid__empty").textContent())?.trim();
  if (!emptyText || !emptyText.includes("没")) await fail("搜索无结果空态缺失: " + emptyText);

  // 8) 截图（恢复全部/清空搜索，留下完整形态）
  await search.fill("");
  await page.locator(".clipinbox__tab", { hasText: "全部" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + "/收集箱页.png" });

  console.log("PASS: 收集箱页 4 页签/计数/筛选/搜索/空态 全过");
} catch (e) {
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}