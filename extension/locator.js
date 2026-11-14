/**
 * 划线定位器（quoted fragment 方案）
 *
 * 选区存成 W3C Web Annotation 的 TextQuoteSelector 三件套：
 *   exact  —— 选中的原文
 *   prefix —— 选中处前面最多 32 个字符
 *   suffix —— 选中处后面最多 32 个字符
 *
 * 为什么不用 #~:text= 或 XPath：快照存档、重排版之后 DOM 会变，
 * 「前后引文」这种模糊定位只要正文没变就总能重新找到位置（matchInText）。
 * 空白统一折叠成单个空格再比较：渲染后的选区文本和快照 HTML 源码里的
 * 空白几乎必然不一致，折叠后才能对上。
 *
 * 浏览器端（content.js）直接当全局用；Node 测试端走 module.exports。
 */
(function (root) {
  var PRE_SUF_LEN = 32;
  var MAX_EXACT_LEN = 2000; // 一次划线最多 2000 字，防误选整页

  // 块级元素：换行发生在它们的边界上。折叠成一段文本时，块与块的交界按一个空格算，
  // 和快照 HTML 源码里的换行折叠后的效果一致——活页与快照两边才能互相命中
  var BLOCK_RE = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|CAPTION|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TBODY|TD|TH|THEAD|TR|UL)$/;

  function nearestBlock(node) {
    var el = node.parentElement;
    while (el) {
      if (BLOCK_RE.test(el.tagName)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function buildNormText(rootEl) {
    var chars = []; // 规范化后的每个字符
    var map = []; // chars[i] -> {node, offset}：该字符在原 DOM 里的位置
    var walker = rootEl.ownerDocument.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    var lastWs = true; // 开头的空白丢弃
    var lastNode = null;
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var v = node.nodeValue;
      // 换了文本节点且块级容器也换了：等价于一次换行，补一个空格
      if (lastNode && nearestBlock(node) !== nearestBlock(lastNode) && !lastWs) { // 不同块元素
        chars.push(" ");
        map.push({ node: node, offset: 0 });
      }
      lastNode = node;
      for (var i = 0; i < v.length; i++) {
        var ch = v[i];
        if (/\s/.test(ch)) {
          if (!lastWs) {
            chars.push(" ");
            map.push({ node: node, offset: i });
            lastWs = true;
          }
        } else {
          chars.push(ch);
          map.push({ node: node, offset: i });
          lastWs = false;
        }
      }
    }
    while (chars.length && chars[chars.length - 1] === " ") {
      chars.pop();
      map.pop();
    }
    return { text: chars.join(""), map: map };
  }

  /**
   * DOM 落点 → 规范文本下标。语义是「从这个位置起（含）的第一个已收录字符」，
   * 所以选区起点直接用、终点用它就天然是 exclusive end。
   * 落点是元素节点时（选区跨元素边界会这样），退到容器内第一个/最后一个字符。
   */
  function locate(map, node, offset, preferEnd) {
    if (node.nodeType === 3) {
      for (var i = 0; i < map.length; i++) {
        if (map[i].node === node && map[i].offset >= offset) return i;
      }
      for (var j = map.length - 1; j >= 0; j--) {
        if (map[j].node === node) return j + 1;
      }
      return -1;
    }
    for (var k = preferEnd ? map.length - 1 : 0; preferEnd ? k >= 0 : k < map.length; preferEnd ? k-- : k++) {
      if (node.contains(map[k].node)) return k;
    }
    return -1;
  }

  /** 选区（Range）→ TextQuoteSelector；拿不到正文返回 null */
  function buildTextQuoteSelector(rootEl, range) {
    var norm = buildNormText(rootEl);
    if (!norm.map.length) return null;
    var s = locate(norm.map, range.startContainer, range.startOffset, false);
    var e = locate(norm.map, range.endContainer, range.endOffset, true);
    if (s < 0 || e < 0 || e <= s) return null;
    while (s < e && norm.text[s] === " ") s++; // 掐掉选区两头的空白
    while (e > s && norm.text[e - 1] === " ") e--;
    if (e - s < 1 || e - s > MAX_EXACT_LEN) return null;
    return {
      exact: norm.text.slice(s, e),
      prefix: norm.text.slice(Math.max(0, s - PRE_SUF_LEN), s),
      suffix: norm.text.slice(e, Math.min(norm.text.length, e + PRE_SUF_LEN)),
    };
  }

  /**
   * 在一段文本里找 selector 的位置（返回起点下标；找不到 -1）。
   * 优先 prefix+suffix 都对上的位置；退而求其次单边对上；再不行 -1。
   * 文本先做和构建时一致的空白折叠，快照 HTML 里的换行/缩进不影响命中。
   */
  function matchInText(rawText, sel) {
    if (!sel || !sel.exact) return -1;
    var text = String(rawText).replace(/[\s ]+/g, " ");
    var exact = sel.exact;
    var prefix = sel.prefix || "";
    var suffix = sel.suffix || "";
    var i = -1;
    var best = -1;
    while ((i = text.indexOf(exact, i + 1)) !== -1) {
      var preOk = !prefix || (i >= prefix.length && text.slice(i - prefix.length, i) === prefix);
      var sufOk =
        !suffix || text.slice(i + exact.length, i + exact.length + suffix.length) === suffix;
      if (preOk && sufOk) return i;
      if (best === -1 && (preOk || sufOk)) best = i;
    }
    return best;
  }

  var api = { buildTextQuoteSelector: buildTextQuoteSelector, matchInText: matchInText, PRE_SUF_LEN: PRE_SUF_LEN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.kfTextLocator = api;
})(typeof self !== "undefined" ? self : globalThis);
