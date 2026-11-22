// W84 Tauri 双验（安装版）：Ctrl+P 搜索 / Ctrl+Alt+V 剪藏 两个全局快捷键
import { chromium } from "playwright-core";
const OUT = "../docs/验收证据/重做批/W84";
mkdirSync2(OUT);
function mkdirSync2(p) {
  import("node:fs").then((m) => m.mkdirSync(p, { recursive: true }));
}
let cdp;
for (let i = 0; i < 20; i++) {
  try {
    cdp = await chromium.connectOverCDP("http://127.0.0.1:9226", { timeout: 3000 });
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!cdp) {
  console.error("FAIL: 连不上安装版 CDP");
  process.exit(1);
}
const page = cdp.contexts()[0].pages().find((p) => /tauri|localhost/.test(p.url()));
if (!page) {
  console.error("FAIL: 未找到安装版页面");
  process.exit(1);
}
await page.bringToFront();
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
});
await page.keyboard.press("Control+P");
await page.locator(".searchpanel__card").waitFor({ timeout: 5000 });
console.log("Ctrl+P 搜索面板 ✓");
await page.keyboard.press("Escape");
await page.locator(".searchpanel__card").waitFor({ state: "detached", timeout: 3000 });
await page.keyboard.press("Control+Alt+V");
await page.locator('[data-testid="clip-dialog"]').waitFor({ timeout: 5000 });
console.log("Ctrl+Alt+V 剪藏弹层 ✓");
await page.keyboard.press("Escape");
await page.locator('[data-testid="clip-dialog"]').waitFor({ state: "detached", timeout: 3000 });
await page.screenshot({ path: OUT + "/W84-Tauri双验-完成.png" });
await page.click('.winbtn[title="关闭"]');
console.log("PASS: W84 Tauri 双验全过（Ctrl+P / Ctrl+Alt+V）");
process.exit(0);
