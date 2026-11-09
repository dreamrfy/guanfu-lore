/**
 * FlowUs 基准采集器（M0-T01 交付物）
 *
 * 一条命令完成：导航 → （可选点开某元素）→ 截图 → 抓取每个可见元素的尺寸与计算样式 → 导出 JSON
 *
 * 用法：
 *   node capture.mjs <名字> [选项]
 *
 * 选项：
 *   --url <地址>      采集前先导航到这个地址
 *   --out <目录>      输出目录（默认 E:\dev\tmp\flowus-cap\capture\<名字>）
 *   --tag <选择器>     只采集该选择器子树（默认整个 body）
 *   --full            额外输出整页长截图
 *   --click <文本>     采集前点击文本完全匹配的元素
 *   --scope <选择器>   --click 的搜索范围（默认全页）
 *   --nth <数字>       --click 命中第几个（默认 0）
 *   --wait <毫秒>      导航后等待时间（默认 3000）
 *   --max <数字>       最多导出多少个元素（默认 1500）
 *
 * 输出文件：
 *   meta.json       页面信息 + 视口 + 时间
 *   page.png        视口截图
 *   full.png        整页截图（仅 --full）
 *   elements.json   每个可见元素的矩形与计算样式
 *   tokens.json     CSS 自定义属性（设计 token）解析值
 *   fonts.json      已加载字体
 *
 * 采集禁区：真 FlowUs 的「配置」页面（含明文密钥）——本脚本会直接拒绝采集。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_URL_PART = 'c579c282-66f3-4e1d-80ea-e893fd646772'; // 真 FlowUs「配置」页
const FORBIDDEN_TITLE = '配置';

function opt(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const name = process.argv[2];
if (!name || name.startsWith('--')) {
  console.error('用法: node capture.mjs <名字> [--url <地址>] [--out <目录>] [--tag <选择器>] [--full] [--click <文本>] [--scope <选择器>] [--nth <n>] [--wait <ms>] [--max <n>]');
  process.exit(1);
}

const url = opt('url', null);
const outDir = opt('out', `E:\\dev\\tmp\\flowus-cap\\capture\\${name}`);
const tag = opt('tag', null);
const full = !!opt('full', false);
const clickText = opt('click', null);
const scope = opt('scope', null);
const nth = parseInt(opt('nth', '0'), 10);
const waitMs = parseInt(opt('wait', '3000'), 10);
const maxN = parseInt(opt('max', '1500'), 10);
const noText = !!opt('no-text', false);
const mask = opt('mask', null);

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

try {
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(waitMs);
  }

  if (clickText) {
    const base = scope ? page.locator(scope) : page;
    const target = base.getByText(String(clickText), { exact: true }).nth(nth);
    await target.click({ force: true, timeout: 10000 });
    await page.waitForTimeout(waitMs);
  }

  // ---- 禁区保护 ----
  const curUrl = page.url();
  const curTitle = await page.title();
  if (curUrl.includes(FORBIDDEN_URL_PART) || curTitle.trim() === FORBIDDEN_TITLE) {
    console.error(`拒绝采集：当前页面命中采集禁区（title="${curTitle}" url="${curUrl}"）`);
    console.error('请先用 --url 或 --click 切到别的页面再采集。');
    process.exit(2);
  }

  // ---- 遮字（布局不变，只让文字不可见；用于截图里不暴露私人内容）----
  if (mask) {
    await page.addStyleTag({
      content:
        `${mask}, ${mask} * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }`,
    });
    await page.waitForTimeout(300);
  }

  // ---- 视口 ----
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    screenW: window.screen.width,
    screenH: window.screen.height,
    availW: window.screen.availWidth,
    availH: window.screen.availHeight,
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    ua: navigator.userAgent,
  }));

  // ---- 截图 ----
  await page.screenshot({ path: path.join(outDir, 'page.png') });
  if (full) await page.screenshot({ path: path.join(outDir, 'full.png'), fullPage: true });

  // ---- 元素尺寸与计算样式 ----
  const result = await page.evaluate(
    ({ sel, maxN, noText }) => {
      const SKIP = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE', 'BR'];
      const out = [];
      const root = sel ? document.querySelector(sel) : document.body;
      if (!root) return { error: '选择器没匹配到: ' + sel };

      const walk = (el, domPath) => {
        if (out.length >= maxN) return;
        if (el.nodeType !== 1) return;
        if (SKIP.includes(el.tagName)) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;

        let own = '';
        for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
        own = own.replace(/\s+/g, ' ').trim().slice(0, 120);

        // 容器文字标签（截断，便于直接看出这个元素是什么）；--no-text 时留空
        const txt = noText ? '' : (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80);

        out.push({
          i: out.length,
          path: domPath,
          tag: el.tagName,
          testId: el.getAttribute('data-test-id') || null,
          role: el.getAttribute('role') || null,
          aria: el.getAttribute('aria-label') || null,
          cls: String(el.className || '').slice(0, 140) || null,
          own: noText ? '' : own,
          txt,
          rect: {
            x: +r.x.toFixed(1), y: +r.y.toFixed(1),
            w: +r.width.toFixed(1), h: +r.height.toFixed(1),
          },
          style: {
            fontFamily: cs.fontFamily,
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            lineHeight: cs.lineHeight,
            letterSpacing: cs.letterSpacing,
            color: cs.color,
            background: cs.backgroundColor,
            hasBgImage: cs.backgroundImage !== 'none',
            padding: cs.padding,
            margin: cs.margin,
            borderRadius: cs.borderRadius,
            border: cs.border,
            borderColor: cs.borderColor,
            display: cs.display,
            position: cs.position,
            gap: cs.gap,
            overflow: cs.overflow,
            hasShadow: cs.boxShadow !== 'none',
            flexDirection: cs.flexDirection,
            alignItems: cs.alignItems,
            justifyContent: cs.justifyContent,
            opacity: cs.opacity,
            zIndex: cs.zIndex,
          },
          childCount: el.children.length,
        });

        let k = 1;
        for (const c of el.children) {
          walk(c, domPath + '>' + c.tagName.toLowerCase() + ':nth-child(' + k + ')');
          k++;
        }
      };

      walk(root, root.tagName.toLowerCase());
      return { count: out.length, truncated: out.length >= maxN, elements: out };
    },
    { sel: tag, maxN, noText }
  );

  // ---- 滚动条度量 ----
  const scrollbars = await page.evaluate(() => {
    const de = document.documentElement;
    const out = {
      docClientW: de.clientWidth,
      docOffsetW: de.offsetWidth,
      docScrollbarW: de.offsetWidth - de.clientWidth,
      docClientH: de.clientHeight,
      docOffsetH: de.offsetHeight,
      docScrollbarH: de.offsetHeight - de.clientHeight,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      scrollers: [],
    };
    document.querySelectorAll('*').forEach((e) => {
      const cs = getComputedStyle(e);
      const scrollable = (cs.overflowY === 'auto' || cs.overflowY === 'scroll');
      if (!scrollable) return;
      const r = e.getBoundingClientRect();
      if (r.width < 300 || r.height < 150) return;
      out.scrollers.push({
        cls: String(e.className || '').slice(0, 90),
        x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        scrollH: e.scrollHeight, clientH: e.clientHeight,
        offsetW: e.offsetWidth, clientW: e.clientWidth,
        scrollbarW: e.offsetWidth - e.clientWidth,
        overflowY: cs.overflowY,
      });
      if (out.scrollers.length >= 8) return;
    });
    return out;
  });

  // ---- 设计 token（CSS 自定义属性）----
  const tokens = await page.evaluate(() => {
    const names = new Set();
    const scan = (rules) => {
      if (!rules) return;
      for (const r of rules) {
        try {
          const st = r.style;
          if (st && st.length) for (const p of st) if (p.startsWith('--')) names.add(p);
        } catch (e) { /* ignore */ }
        if (r.cssRules) scan(r.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { scan(sheet.cssRules); } catch (e) { /* 跨域表跳过 */ }
    }
    const rootCs = getComputedStyle(document.documentElement);
    const bodyCs = getComputedStyle(document.body);
    const resolved = {};
    for (const n of names) {
      if (Object.keys(resolved).length > 3000) break;
      let v = rootCs.getPropertyValue(n).trim();
      if (!v) v = bodyCs.getPropertyValue(n).trim();
      if (v) resolved[n] = v;
    }
    return { declared: names.size, resolved };
  });

  // ---- 字体 ----
  const fonts = await page.evaluate(() => {
    const list = [];
    try { document.fonts.forEach((f) => list.push({ family: f.family, weight: f.weight, style: f.style, status: f.status })); } catch (e) { /* ignore */ }
    return list;
  });

  const meta = {
    name,
    capturedAt: new Date().toISOString(),
    url: curUrl,
    title: curTitle,
    tag: tag || 'body',
    noText,
    viewport,
    elementCount: result.count ?? null,
    truncated: result.truncated ?? null,
    tokenDeclared: tokens.declared,
    tokenResolved: Object.keys(tokens.resolved).length,
    fontCount: fonts.length,
  };

  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(outDir, 'scrollbars.json'), JSON.stringify(scrollbars, null, 2));
  fs.writeFileSync(path.join(outDir, 'elements.json'), JSON.stringify(result, null, 1));
  fs.writeFileSync(path.join(outDir, 'tokens.json'), JSON.stringify(tokens, null, 1));
  fs.writeFileSync(path.join(outDir, 'fonts.json'), JSON.stringify(fonts, null, 1));

  console.log('=== 采集完成 ===');
  console.log('页面:', curTitle, '|', curUrl);
  console.log('视口:', viewport.innerWidth + 'x' + viewport.innerHeight, 'DPR', viewport.dpr);
  console.log('元素:', meta.elementCount, meta.truncated ? '(已截断)' : '');
  console.log('设计 token:', meta.tokenDeclared, '声明 /', meta.tokenResolved, '可解析');
  console.log('字体:', meta.fontCount);
  console.log('文档滚动条:', scrollbars.docScrollbarW, 'px 宽 /', scrollbars.docScrollbarH, 'px 高 | 可滚动容器:', scrollbars.scrollers.length, '个');
  console.log('输出目录:', outDir);
} finally {
  await browser.close();
}
