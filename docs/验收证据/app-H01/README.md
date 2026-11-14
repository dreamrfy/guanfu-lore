# H01 扩展选区上报证据（2026-11-15 · 看门狗 v4）

## 需求与实现

选中网页文字 → 浮出「🖍 划线」按钮 → 选区按 **quoted fragment 方案**（W3C TextQuoteSelector：`exact` + 前 32 字 `prefix` + 后 32 字 `suffix`）打包 → POST `/api/highlights`（pageUrl / title / quote）→ 服务端应答后页面右下角提示。

- `extension/locator.js`（新增，UMD，content.js 当全局用、Node 测试借 module.exports 加载）：
  - `buildTextQuoteSelector(root, range)`：TreeWalker 收集文本 → 规范化（空白折叠成单空格；**块级元素边界按一个空格算**——活页 DOM 里 `<p>` 之间没有空白字符，而快照 HTML 源码里有换行，两边必须折叠成同一形态才能互相命中）→ 选区起止经「字符 ↔ DOM 位置」映射表换算 → 掐掉两端空白 → 三件套。选区超 2000 字拒收（防误选整页）。
  - `matchInText(text, selector)`：在任意文本里找回位置——优先 prefix+suffix 双边对上，退而求其次单边，都不行 -1。这是 H03 客户端高亮渲染要用的核心。
- `extension/content.js`：mouseup 延迟 10ms 检查选区（等浏览器定住）→ 选区附近浮按钮（mousedown 阻止冒泡防选区丢失）→ 点击上报 → 成功清选区。`manifest.json` content_scripts 增加 `locator.js`。
- 接口契约（H02 服务端按此实现）：`POST /api/highlights` 请求 `{pageUrl, title, quote:{exact,prefix,suffix}}`，应答 `{ok:true, ...}`。

## 测试（app/src/data/extensionLocator.test.ts，5 例，全套件 221/221 绿；tsc 干净）

1. matchInText：prefix+suffix 在重复文本里锁定第二处；无引文时取第一处；无匹配 -1。
2. matchInText：空白折叠——快照里的换行/缩进/多空格不影响命中。
3. buildTextQuoteSelector：普通选区给出三件套，prefix 恰为「前面 32 字」窗口。
4. 跨段落选区（块边界补空格）+ 在空白不同的快照文本里找回同一位置——活页↔快照闭环。
5. 空选区返回 null；空 exact 返回 -1。

## 已知边界

- 页面正文如果改了字，exact 找不回（引文方案固有限制，按设计接受）。
- 选区起止落在元素节点（跨元素边界）按容器内首/末字符兜底。
