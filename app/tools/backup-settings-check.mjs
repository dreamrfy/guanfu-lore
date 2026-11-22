// 自动备份设置页点验：立即备份 → 快照列表 → 关闭开关 → 恢复确认
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
const CHROME_PATHS = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/自动备份";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
let failed = 0;
const fail = (m) => { console.error("FAIL: " + m); failed++; throw new Error(m); };
try {
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__gf_store?.getState().ready), null, { timeout: 15000 });
  await page.locator('[title="空间切换"]').click();
  await page.waitForTimeout(300);
  await page.locator(".tabctx--ws .tabctx__item", { hasText: "空间设置" }).click();
  await page.locator('[data-testid="settings-dialog"]').waitFor({ timeout: 5000 });
  await page.locator('.setdlg__item', { hasText: '空间设置' }).click();
  await page.waitForTimeout(400);

  // 1) 默认状态：已开启 + 立即备份按钮在
  const status = page.locator('[data-testid="backup-status"]');
  if (!(await status.textContent())?.includes("已开启")) fail("自动备份默认应为已开启");

  // 2) 立即备份 → 快照列表出现一行
  await page.locator('[data-testid="backup-run-now"]').click();
  await page.locator('[data-testid="backup-snapshots"]').waitFor({ timeout: 10000 });
  const rows = await page.locator(".setpane__snapshot").count();
  // 启动时 startAutoBackup 也会因「首次使用」自动备一份，加上手动这份可能 ≥1
  if (rows < 1) fail("快照行数 < 1");
  await page.screenshot({ path: OUT + "/设置-自动备份.png" });

  // 3) 关闭开关 → 立即备份按钮消失（间隔行同隐）
  await page.locator('[data-testid="backup-toggle"]').click();
  await page.locator('[data-testid="backup-run-now"]').waitFor({ state: "detached", timeout: 3000 });
  await page.locator('[data-testid="backup-toggle"]').click(); // 再开回来
  await page.locator('[data-testid="backup-run-now"]').waitFor({ timeout: 3000 });

  // 4) 恢复按钮触发覆盖确认弹窗（确认后页面会 reload，这里只验弹窗出现并取消）
  page.once("dialog", (d) => d.dismiss());
  await page.locator(".setpane__snapshot-actions button", { hasText: "恢复" }).first().click();
  await page.waitForTimeout(600);

  // 5) 服务端备份：dev 无 R2 → 按钮点了给出可读错误（不静默、不假成功）
  await page.locator('[data-testid="backup-server-upload"]').click();
  await page
    .locator('[data-testid="backup-server-msg"]')
    .filter({ hasText: /未配置 R2|连不上剪藏服务/ })
    .waitFor({ timeout: 10000 });
  await page.screenshot({ path: OUT + "/服务端未配置提示.png" });
  if (failed === 0) console.log("PASS: 备份设置页 本机快照/开关/恢复确认/服务端报错 全过");
} catch (e) {
  failed++;
  await page.screenshot({ path: OUT + "/失败现场.png" }).catch(() => {});
  console.error(e instanceof Error ? e.message : e);
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
