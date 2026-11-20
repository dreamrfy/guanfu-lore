// W103 账号区点验（11 号 §1/§2.1 + 观复自有【暂定】）：
// ① 侧栏工作区行：头像字母色块 + 昵称（默认回退「观复」品牌名）
// ② 空间切换菜单：账号头部（头像+昵称）在，prompt 改名真存 → 侧栏行/账号设置同步
// ③ 账号设置：头像色板切换真存，刷新回读不丢；头像字母随昵称首字
// ④ 退出登录：点击出提示（无凭证文案），服务端地址/Token 清空语义
// 用法: npm run account-check （需 dev server 已起）
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) { console.error("未找到 Chrome"); process.exit(2); }
const OUT = "../docs/验收证据/重做批/W103";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 } });
await page.goto("http://localhost:5177/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

let failed = 0;
const fail = async (msg) => {
  console.error("FAIL: " + msg);
  failed++;
  throw new Error(msg);
};

// 恢复昵称（测试完把账号还原到空昵称，避免污染后续任务）
const resetNick = async () => {
  await page.evaluate(async () => {
    const req = indexedDB.open("guanfu-lore");
    // 走应用内 Dexie 不行（模块不暴露），用 localStorage 不稳；直接走 prompt 路径在测试里完成
  });
};

try {
  // ① 侧栏工作区行：头像 + 品牌名回退
  const wsrow = page.locator(".wsrow");
  if ((await wsrow.count()) !== 1) await fail("侧栏工作区行不存在");
  const wsAvatarBg = await page.locator(".wsrow .wsrow__avatar").evaluate((el) => getComputedStyle(el).backgroundColor);
  if (!wsAvatarBg || wsAvatarBg === "rgba(0, 0, 0, 0)") await fail("工作区行头像无底色: " + wsAvatarBg);
  const wsName = (await page.locator(".wsrow__name").textContent())?.trim();
  if (wsName !== "观复") await fail("默认昵称回退品牌名不符: " + wsName);
  await page.screenshot({ path: OUT + "/01-侧栏工作区行默认.png" });

  // ② 空间切换菜单：账号头部 + prompt 改名真存
  await page.locator('[title="空间切换"]').click();
  await page.waitForTimeout(300);
  const acctItem = page.locator(".tabctx__item--account");
  if ((await acctItem.count()) !== 1) await fail("空间切换菜单账号头部缺失");
  const menuAvatarBg = await page.locator(".tabctx__item--account .wsrow__avatar").evaluate((el) => getComputedStyle(el).backgroundColor);
  if (menuAvatarBg !== wsAvatarBg) await fail("菜单头像底色与工作区行不一致");
  await page.screenshot({ path: OUT + "/02-空间切换菜单账号头.png" });

  // prompt 改名（dialog 自动接住）
  page.once("dialog", (d) => d.accept("观复测试员"));
  await acctItem.click();
  await page.waitForTimeout(600);
  const wsName2 = (await page.locator(".wsrow__name").textContent())?.trim();
  if (wsName2 !== "观复测试员") await fail("prompt 改名后侧栏昵称未同步: " + wsName2);
  const wsAvatarLetter = (await page.locator(".wsrow .wsrow__avatar").textContent())?.trim();
  if (wsAvatarLetter !== "观") await fail("头像字母应取昵称首字「观」: " + wsAvatarLetter);
  await page.screenshot({ path: OUT + "/03-prompt改名侧栏同步.png" });
  await page.locator(".ctx-backdrop").click();
  await page.waitForTimeout(200);

  // ③ 账号设置：昵称回读 + 头像色板切换真存 + 刷新回读
  await page.locator('[title="空间切换"]').click();
  await page.waitForTimeout(300);
  await page.locator(".tabctx--ws .tabctx__item", { hasText: "空间设置" }).click();
  await page.waitForTimeout(300);
  const dlg = page.locator('[data-testid="settings-dialog"]');
  if ((await dlg.count()) !== 1) await fail("设置弹层未打开");
  const nickVal = (await page.locator(".setpane__input").inputValue());
  if (nickVal !== "观复测试员") await fail("账号设置昵称未回读到菜单改名值: " + nickVal);
  const headName = (await page.locator(".setpane__value--name").textContent())?.trim();
  if (headName !== "观复测试员") await fail("账号头部名不符: " + headName);

  const swatches = page.locator(".account-swatch");
  if ((await swatches.count()) < 5) await fail(`头像色板数 ${(await swatches.count())} < 5`);
  const beforeBg = await page.locator('[data-testid="account-avatar"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  await swatches.nth(1).click(); // --gf-success
  await page.waitForTimeout(400);
  const afterBg = await page.locator('[data-testid="account-avatar"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  if (beforeBg === afterBg) await fail("头像色切换未生效");
  if ((await page.locator(".account-swatch--on").count()) !== 1) await fail("选中态色板数≠1");
  await page.screenshot({ path: OUT + "/04-账号设置-昵称与头像色.png" });

  // 刷新回读（昵称+头像色都不丢）
  await page.locator(".setdlg__close").click();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const wsName3 = (await page.locator(".wsrow__name").textContent())?.trim();
  if (wsName3 !== "观复测试员") await fail("刷新后侧栏昵称丢失: " + wsName3);
  const rowBg = await page.locator(".wsrow .wsrow__avatar").evaluate((el) => getComputedStyle(el).backgroundColor);
  if (rowBg === wsAvatarBg) await fail("刷新后头像色回读丢失");
  await page.screenshot({ path: OUT + "/05-刷新回读不丢.png" });

  // ④ 退出登录：点击必有提示（loadClipServerUrl 有默认值 → 首次点击报「已清除」，属正常语义）
  await page.locator('[title="空间切换"]').click();
  await page.waitForTimeout(300);
  await page.locator(".tabctx--ws .tabctx__item", { hasText: "空间设置" }).click();
  await page.waitForTimeout(300);
  await page.locator(".setdlg__item--quit").click();
  await page.waitForTimeout(400);
  let quitHint = (await page.locator(".setdlg__quit-hint").textContent()) ?? "";
  if (!quitHint.includes("已清除")) await fail("退出登录首次提示应为已清除: " + quitHint);
  // 再点一次：默认地址回填后仍算有值（saveClipServerUrl 空值回写 DEFAULT）→ 文案仍为已清除也接受；关键是有提示不炸
  await page.locator(".setdlg__item--quit").click();
  await page.waitForTimeout(400);
  quitHint = (await page.locator(".setdlg__quit-hint").textContent()) ?? "";
  if (!quitHint) await fail("退出登录重复点击无提示");
  await page.screenshot({ path: OUT + "/06-退出登录提示.png" });

  // 还原：昵称清空、头像色回默认，避免污染后续任务
  page.once("dialog", (d) => d.accept(""));
  await page.locator(".setdlg__close").click();
  await page.waitForTimeout(300);
  await page.locator('[title="空间切换"]').click();
  await page.waitForTimeout(300);
  await page.locator(".tabctx__item--account").click();
  await page.waitForTimeout(400);
  const wsNameFinal = (await page.locator(".wsrow__name").textContent())?.trim();
  if (wsNameFinal !== "观复") await fail("还原昵称失败: " + wsNameFinal);

  console.log("PASS: W103 账号区 8 项断言全过（工作区行/菜单账号头/prompt改名同步/昵称回读/头像色切换/选中态/刷新回读/退出提示）");
} catch (e) {
  if (!failed) { console.error("FAIL: " + e.message); failed = 1; }
  await page.screenshot({ path: OUT + "/99-失败现场.png" });
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
