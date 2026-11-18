// W76 记录页点验：面包屑、属性行(名+值)、未填写占位、属性行菜单6项、设置属性、添加属性、创建按钮直接开记录页、正文引导
// 用法: npm run recordpage-check
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

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const fail = async (msg) => {
  console.error("FAIL: " + msg);
  await page.screenshot({ path: "../docs/验收证据/重做批/W76/recordpage-失败现场.png", fullPage: true });
  await browser.close();
  process.exit(1);
};

mkdirSync("../docs/验收证据/重做批/W76", { recursive: true });

await page.locator(".sidebar__group-label").nth(1).locator(".groupbtn").nth(1).click();
await page.waitForTimeout(1200);

// ① 「创建」直接新建一条记录并打开记录页（不是菜单）
await page.locator("button", { hasText: "新建记录" }).first().click();
await page.waitForTimeout(1200);
const rightCount = await page.locator(".shell__right").count();
const rightVisible = rightCount ? await page.locator(".shell__right").first().isVisible() : false;
console.log("点「新建记录」后右侧记录页可见 =", rightVisible);
if (!rightVisible) await fail("「新建记录」没有直接打开记录页");

// ② 面包屑：表名 / 记录名
const crumb = (await page.locator(".panel__crumb").innerText()).replace(/\s+/g, " ").trim();
console.log("面包屑 =", JSON.stringify(crumb));
if (!crumb.includes("/")) await fail(`面包屑应是「表 / 记录」，实际「${crumb}」`);

// ③ 属性区：字段名 + 值
const propRows = await page.locator(".record__prop").count();
const labels = (await page.locator(".record__label-btn").allInnerTexts()).map((t) => t.trim());
console.log("属性行数 =", propRows, "| 属性名 =", JSON.stringify(labels));
if (propRows < 1) await fail("属性区没渲染");
if (!labels.length) await fail("属性名没渲染");

// ④ 未填写占位（可点，点一下换成真实编辑器）
// 先加一个「文本」属性做测试靶子：单选属性一点就弹选择面板，会挡住后面的菜单截图
const addBtnEarly = page.locator(".record__add-prop").first();
await addBtnEarly.click();
await page.waitForTimeout(900);
console.log("加属性后行数 =", await page.locator(".record__prop").count());

const textLabel = page.locator(".record__label-btn", { hasText: "文本" }).first();
const textLabelCount = await textLabel.count();
console.log("文本属性名存在 =", textLabelCount);
if (!textLabelCount) await fail("没加出「文本」属性");

const placeholders = (await page.locator(".record__placeholder").allInnerTexts()).map((t) => t.trim());
console.log("未填写占位数 =", placeholders.length, "=", JSON.stringify(placeholders.slice(0, 4)));
if (!placeholders.length) await fail("没有「未填写」占位");
if (!placeholders.includes("未填写")) await fail(`占位文案不对：${JSON.stringify(placeholders)}`);
// 点「未填写」→ 换成输入框（点文本属性那个占位，别点单选的）
const textProp = page.locator(".record__prop").filter({ has: textLabel }).first();
const textPlaceholder = textProp.locator(".record__placeholder").first();
await textPlaceholder.click();
await page.waitForTimeout(400);
const editorAfterClick = await textProp.locator("input.cell-input").count();
console.log("点「未填写」后编辑器出现 =", editorAfterClick);
if (!editorAfterClick) await fail("点「未填写」没换成真实编辑器");
// 收起编辑器（点面板外），让后面的属性行菜单截图干净
await page.locator(".panel__crumb").click();
await page.waitForTimeout(500);

// ⑤ 点属性名 → 属性行菜单（照录 6 项）
// 用「文本」属性（避开单选面板正好开着的时候，截图才干净）
await textLabel.click();
await page.waitForTimeout(400);
const menu = page.locator(".prop-menu").first();
if (!(await menu.count())) await fail("点属性名没弹出属性行菜单");
const menuItems = (await menu.locator(".menu-item").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
const hasType = await menu.locator(".col-menu__label", { hasText: "更换类型" }).count();
console.log("属性行菜单项 =", JSON.stringify(menuItems), "| 含更换类型 =", hasType);
for (const want of ["设置属性", "隐藏", "拷贝副本", "删除"]) {
  if (!menuItems.includes(want)) await fail(`属性行菜单缺「${want}」`);
}
if (!hasType) await fail("属性行菜单缺「更换类型」");
await page.screenshot({ path: "../docs/验收证据/重做批/W76/记录页-属性行菜单.png" });

// ⑥ 「设置属性」→ 属性编辑面板
await menu.locator(".menu-item", { hasText: "设置属性" }).click();
await page.waitForTimeout(500);
const settings = page.locator(".prop-menu").first();
const settingsLabels = (await settings.locator(".col-menu__label").allInnerTexts()).map((t) => t.trim());
console.log("属性编辑面板项 =", JSON.stringify(settingsLabels));
if (!settingsLabels.includes("属性名")) await fail("「设置属性」没打开属性编辑面板");
await page.screenshot({ path: "../docs/验收证据/重做批/W76/记录页-属性编辑面板.png" });
// 关掉属性编辑面板（点「完成」）
await settings.locator(".menu-item", { hasText: "完成" }).click();
await page.waitForTimeout(500);

// ⑦ 「＋ 添加属性」→ 属性数 +1（④ 已加过一个，这里再加一个验证可重复添加）
const beforeProps = await page.locator(".record__prop").count();
const addBtn = page.locator(".record__add-prop").first();
if (!(await addBtn.count())) await fail("没有「＋ 添加属性」按钮");
console.log("添加属性按钮文字 =", (await addBtn.innerText()).trim());
await addBtn.click();
await page.waitForTimeout(900);
const afterProps = await page.locator(".record__prop").count();
console.log("添加属性: 行数", beforeProps, "→", afterProps);
if (afterProps !== beforeProps + 1) await fail("「＋ 添加属性」没加出属性");

// ⑧ 隐藏 → 属性行消失
await textLabel.click();
await page.waitForTimeout(400);
await page.locator(".prop-menu .menu-item", { hasText: "隐藏" }).first().click();
await page.waitForTimeout(700);
const afterHide = await page.locator(".record__prop").count();
console.log("隐藏后行数 =", afterHide);
if (afterHide >= afterProps) await fail("「隐藏」没把属性收起来");

await page.screenshot({ path: "../docs/验收证据/重做批/W76/记录页.png" });

// ⑨ 正文引导
const hint = await page.locator(".record__body-hint").count();
console.log("正文引导数 =", hint);
if (!hint) await fail("正文为空时没有「按回车开始编辑，或模板」引导");

// ⑩ 填标题 → 面包屑跟着变
const titleInput = page.locator(".record__title").first();
await titleInput.fill("我的记录标题");
await page.waitForTimeout(700);
const crumb2 = (await page.locator(".panel__crumb").innerText()).replace(/\s+/g, " ").trim();
console.log("填标题后面包屑 =", JSON.stringify(crumb2));
if (!crumb2.includes("我的记录标题")) await fail("面包屑里的记录名没跟着标题变");

await browser.close();
console.log("PASS: 记录页面包屑/属性行/未填写/属性行菜单6项/设置属性/添加属性/隐藏/正文引导/标题联动 全部真实生效");
