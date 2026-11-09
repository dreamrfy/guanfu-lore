import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

const items = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-test-id="aside-item-toc"]')).map((e, i) => ({
    i, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 20),
  }))
);
console.log('侧栏页项:', JSON.stringify(items));

for (const it of items) {
  if (it.text === '配置') { console.log(it.i, '配置 -> 跳过（禁区）'); continue; }
  try {
    await page.locator('[data-test-id="aside-item-toc"]').nth(it.i).click({ force: true, timeout: 8000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const main = document.querySelector('.main-panel') || document.body;
      const t = (main.innerText || '').replace(/\s+/g, ' ').trim();
      // 去掉固定 chrome（侧栏/顶栏/提示条）后的正文长度估算
      return { len: t.length, head: t.slice(0, 60), url: location.href };
    });
    console.log(`${it.i} 「${it.text}」 正文长度=${r.len}  url=${r.url.slice(-12)}`);
  } catch (e) {
    console.log(it.i, it.text, '点击失败:', e.message.split('\n')[0]);
  }
}
await browser.close();
