// Phase 1 视觉零变化验证（确定性版）
// 页面里的「创建/最后修改」时间戳每次运行都变，会掩盖真实差异。
// 本脚本在截图前用 CSS 把时间戳文字涂成透明、并把日期区域刷成统一色，
// 使两张图可比；再叠加 34 个探测点的计算样式比对（与命名无关）。
//
// 用法: node tools/token-verify-shot.mjs <输出目录>
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

const outDir = process.argv[2] ?? "../ops/tmp/token-verify";
mkdirSync(outDir, { recursive: true });

/** 探测点：选择器 → 要取的 CSS 属性。与变量命名无关，只看算出来的值。 */
const PROBES = [
  ["body", ["backgroundColor", "color", "fontFamily", "fontSize"]],
  [".shell", ["backgroundColor"]],
  [".shell__sidebar", ["backgroundColor", "borderRightColor", "width"]],
  [".shell__right", ["backgroundColor", "borderLeftColor"]],
  [".tabbar", ["height", "backgroundColor", "boxShadow"]],
  [".tab--active", ["color", "backgroundColor", "boxShadow"]],
  [".toolbar", ["height"]],
  [".sidebar__search", ["backgroundColor", "borderColor", "borderRadius"]],
  [".tree-item", ["height", "fontSize", "borderRadius"]],
  [".wsrow__avatar", ["backgroundColor", "color", "borderRadius"]],
  [".btn", ["height", "backgroundColor", "color", "borderColor", "borderRadius", "fontSize"]],
  [".icon-btn", ["color"]],
  [".modal__error", ["color", "backgroundColor"]],
  [".modal__ok", ["color", "backgroundColor"]],
  [".hit__snippet mark", ["backgroundColor", "color"]],
  [".callout--grey", ["backgroundColor"]],
  [".callout--yellow", ["backgroundColor"]],
  [".callout--red", ["backgroundColor"]],
  [".callout--blue", ["backgroundColor"]],
  [".page-mention", ["color"]],
  [".grid__th", ["backgroundColor", "height", "position"]],
  [".grid__cell", ["backgroundColor", "height"]],
  [".pill", ["borderRadius", "fontSize", "lineHeight"]],
  [".cell-cal__cell--on", ["backgroundColor", "color"]],
  [".confirm__btn--danger", ["color", "borderColor"]],
  [".ai__msg--user", ["backgroundColor", "color"]],
  [".sync-diff--changed", ["borderLeftColor"]],
  [".sync-diff--mineOnly", ["borderLeftColor"]],
  [".record__mark mark", ["backgroundColor"]],
  [".trashbar", ["backgroundColor", "color", "boxShadow", "borderRadius"]],
  [".winbtn--close", ["backgroundColor", "color"]],
  [".cover", ["height"]],
  [".bn-editor", ["fontFamily"]],
];

/** 抹掉时间戳：把页面里所有形如日期的文本节点涂成透明。 */
const MASK_JS = `
  (() => {
    const re = /\\d{4}[/\\-]\\d{1,2}[/\\-]\\d{1,2}/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    let n;
    while ((n = walker.nextNode())) {
      if (re.test(n.nodeValue || "")) hits.push(n);
    }
    for (const t of hits) {
      const span = document.createElement("span");
      span.style.visibility = "hidden";
      span.textContent = t.nodeValue;
      t.parentNode.replaceChild(span, t);
    }
    return hits.length;
  })()
`;

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 762 }, deviceScaleFactor: 1 });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

async function readProbes(theme) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.waitForTimeout(350);
  return page.evaluate((probes) => {
    const out = {};
    for (const [sel, props] of probes) {
      const el = document.querySelector(sel);
      if (!el) {
        out[sel] = { "(元素不存在)": "1" };
        continue;
      }
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of props) o[p] = cs[p];
      out[sel] = o;
    }
    return out;
  }, PROBES);
}

const light = await readProbes("light");
const masked = await page.evaluate(MASK_JS);
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/light.png` });

const dark = await readProbes("dark");
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/dark.png` });

console.log(JSON.stringify({ maskedTimeStamps: masked, light, dark }, null, 2));
await browser.close();
console.log(`已保存到 ${outDir}/light.png 与 ${outDir}/dark.png`);
