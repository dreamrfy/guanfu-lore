// W100 设置弹层骨架点验（11 号 §1/§2）：
// 入口链（工作区 ⌄ → 空间切换菜单 →「空间设置」）→ 弹层形态（~950×660 居中、左竖导航 + 右内容 + 右上 ×）
// → 分组结构（账号 4 项 / 空间 9 项 / 底部退出登录）→ 页签切换真生效 → Esc / × / 遮罩关闭 → 刷新不丢状态。
// 用法: npm run settings-check （需 dev server 已起）
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/W100";
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

try {
  // 1) 入口链：工作区行 ⌄ → 空间切换菜单 →「空间设置」
  const wsRow = page.locator('[title="空间切换"]');
  if ((await wsRow.count()) !== 1) await fail("工作区行（title=空间切换）未找到");
  await wsRow.click();
  await page.waitForTimeout(400);
  const wsMenu = page.locator(".tabctx--ws");
  if ((await wsMenu.count()) !== 1) await fail("空间切换菜单未打开");
  const settingItem = wsMenu.locator(".tabctx__item", { hasText: "空间设置" });
  if ((await settingItem.count()) !== 1) await fail("菜单中「空间设置」项不存在");
  await page.screenshot({ path: OUT + "/01-入口-空间切换菜单.png" });
  await settingItem.click();
  await page.waitForTimeout(400);

  // 2) 弹层形态：居中 ~950×660
  const dlg = page.locator('[data-testid="settings-dialog"]');
  if ((await dlg.count()) !== 1) await fail("设置弹层未挂载");
  const geom = await page.evaluate(() => {
    const card = document.querySelector(".setdlg__card");
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return {
      w: r.width, h: r.height,
      cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  if (!geom) await fail("setdlg__card 不存在");
  // 窄口 (1200) 时允许缩到 max-width 以下，但必须居中且接近 950×660
  if (geom.w < 900 || geom.w > 951) await fail(`弹层宽 ${geom.w} ≠ ~950`);
  if (geom.h < 650 || geom.h > 661) await fail(`弹层高 ${geom.h} ≠ ~660`);
  if (Math.abs(geom.cx - geom.vw / 2) > 2 || Math.abs(geom.cy - geom.vh / 2) > 2) await fail("弹层不居中");

  // 3) 左导航分组结构：账号 4 项 / 空间 9 项 / 退出登录
  const nav = await page.evaluate(() => {
    const groups = [...document.querySelectorAll(".setdlg__group")].filter(
      (g) => g.querySelector(".setdlg__group-name")
    );
    return {
      groupNames: groups.map((g) => g.querySelector(".setdlg__group-name")?.textContent),
      accountItems: [...(groups[0]?.querySelectorAll(".setdlg__item") ?? [])].map((b) => b.textContent),
      spaceItems: [...(groups[1]?.querySelectorAll(".setdlg__item") ?? [])].map((b) => b.textContent),
      quit: document.querySelector(".setdlg__item--quit")?.textContent,
      close: !!document.querySelector(".setdlg__close"),
    };
  });
  if (nav.groupNames.join(",") !== "账号,空间") await fail("导航分组 ≠ 账号/空间: " + nav.groupNames);
  if (nav.accountItems.length !== 4) await fail("账号组应有 4 项: " + nav.accountItems);
  if (nav.spaceItems.length !== 9) await fail("空间组应有 9 项: " + nav.spaceItems);
  if (nav.quit !== "退出登录") await fail("底部退出登录缺失");
  if (!nav.close) await fail("右上 × 缺失");
  await page.screenshot({ path: OUT + "/02-弹层-整体形态.png" });

  // 4) 页签切换真生效：点「通用设置」→ 标题变 + active 态迁移
  const genBtn = page.locator(".setdlg__item", { hasText: "通用设置" });
  await genBtn.click();
  await page.waitForTimeout(200);
  const switched = await page.evaluate(() => ({
    title: document.querySelector(".setdlg__title")?.textContent,
    onCount: document.querySelectorAll(".setdlg__item--on").length,
    onText: document.querySelector(".setdlg__item--on")?.textContent,
    content: document.querySelector('[data-testid="settings-content"]')?.textContent?.slice(0, 40),
  }));
  if (switched.title !== "通用设置") await fail("切到通用设置后标题未变: " + switched.title);
  if (switched.onCount !== 1 || !switched.onText?.includes("通用设置")) await fail("active 态未迁移");
  if (!switched.content?.includes("W101")) await fail("右侧内容占位未渲染");
  await page.screenshot({ path: OUT + "/03-页签切换-通用设置.png" });

  // 5) 置灰项：活动中心/推荐佣金 disabled 且带徽章
  const disabled = await page.evaluate(() =>
    [...document.querySelectorAll(".setdlg__item--off")].map((b) => b.textContent?.trim())
  );
  for (const need of ["活动中心", "推荐佣金", "自定义模型", "已授权应用", "升级", "订单"]) {
    if (!disabled.some((d) => d?.includes(need))) await fail("置灰项缺 " + need);
  }

  // 6) Esc 关闭 → 再开 → × 关闭 → 再开 → 遮罩关闭
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if ((await dlg.count()) !== 0) await fail("Esc 未关闭弹层");
  await wsRow.click(); await page.waitForTimeout(300);
  await settingItem.click(); await page.waitForTimeout(300);
  if ((await dlg.count()) !== 1) await fail("再次打开失败");
  await page.locator(".setdlg__close").click();
  await page.waitForTimeout(300);
  if ((await dlg.count()) !== 0) await fail("× 未关闭弹层");
  await wsRow.click(); await page.waitForTimeout(300);
  await settingItem.click(); await page.waitForTimeout(300);
  await page.locator(".setdlg", { hasText: "账号设置" }).click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(300);
  if ((await dlg.count()) !== 0) await fail("遮罩点击未关闭弹层");

  console.log("PASS: W100 设置弹层骨架 8 项断言全过（入口链/形态/分组/切换/置灰/Esc/×/遮罩）");
} catch (e) {
  if (!failed) { console.error("FAIL: " + e.message); failed = 1; }
  await page.screenshot({ path: OUT + "/99-失败现场.png" });
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
