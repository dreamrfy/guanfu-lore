// HTML 清洗自测（P1-03 / P1-05）
// 覆盖：无引号/单引号/双引号事件属性、script/iframe/svg/object/embed、javascript:/data:、
//       srcdoc、隐藏样式、懒加载补 src、正常排版标签保留。
// 用法: node tests/sanitize.selftest.ts
import { sanitizeContent, imgUrlOf, extractJsContent, htmlToText, hardenOfflineHtml } from "../src/fetch/htmlSanitize.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function mustNotContain(label: string, html: string, needle: string): void {
  check(label, !html.toLowerCase().includes(needle.toLowerCase()), "输出仍含 " + needle + "：" + html.slice(0, 160));
}

const malicious: Array<[string, string]> = [
  ["无引号 onerror", '<img src="x" onerror=alert(1)>'],
  ["单引号 onerror", "<img src='x' onerror='alert(1)'>"],
  ["双引号 onerror", '<img src="x" onerror="alert(1)">'],
  ["大写事件名", '<IMG SRC="x" ONERROR="alert(1)">'],
  ["onload", '<img src="x" onload="alert(1)">'],
  ["onmouseover", '<div onmouseover="steal()">文字</div>'],
  ["script 标签", '<p>前</p><script>alert(1)</script><p>后</p>'],
  ["script 无闭合", '<p>前</p><script>alert(1)'],
  ["iframe srcdoc", '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>'],
  ["iframe 普通", '<iframe src="https://evil.example/"></iframe>'],
  ["svg onload", '<svg onload="alert(1)"><circle r="10"/></svg>'],
  ["math href", '<math><mtext><a href="javascript:alert(1)">x</a></mtext></math>'],
  ["object", '<object data="evil.swf"></object>'],
  ["embed", '<embed src="evil.swf">'],
  ["meta refresh", '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
  ["base", '<base href="https://evil.example/">'],
  ["link", '<link rel="stylesheet" href="https://evil.example/x.css">'],
  ["javascript: 链接", '<a href="javascript:alert(1)">点我</a>'],
  ["javascript: 大小写混写", '<a href="JaVaScRiPt:alert(1)">点我</a>'],
  ["data: 脚本链接", '<a href="data:text/html;base64,PHNjcmlwdD4=">点我</a>'],
  ["data:text/html 图片", '<img src="data:text/html;base64,PHNjcmlwdD4=">'],
  ["formaction", '<button formaction="javascript:alert(1)">x</button>'],
  ["style 表达式", '<div style="width:expression(alert(1))">x</div>'],
  ["style 外链", '<div style="background-image:url(https://evil.example/x.png)">x</div>'],
  ["隐藏样式", '<div style="visibility:hidden;opacity:0;color:red">看不见</div>'],
];

for (const [label, html] of malicious) {
  const out = sanitizeContent(html);
  mustNotContain(label + " → 无 on* 事件", out, "onerror");
  mustNotContain(label + " → 无 onload", out, "onload");
  mustNotContain(label + " → 无 onmouseover", out, "onmouseover");
  mustNotContain(label + " → 无 script", out, "<script");
  mustNotContain(label + " → 无 javascript:", out, "javascript:");
  mustNotContain(label + " → 无 srcdoc", out, "srcdoc");
  mustNotContain(label + " → 无 iframe", out, "<iframe");
  mustNotContain(label + " → 无 svg", out, "<svg");
  mustNotContain(label + " → 无 object/embed", out, "<object");
  mustNotContain(label + " → 无 data: 地址（非图片场景）", out, "data:text/html");
  mustNotContain(label + " → 无 expression(", out, "expression(");
}

// 隐藏样式必须被清除，其他样式保留
const hidden = sanitizeContent('<div style="visibility:hidden;opacity:0;color:red;text-align:center">正文</div>');
check("隐藏样式被清除", !/visibility|opacity/i.test(hidden), hidden);
check("正常样式保留", /color/.test(hidden) && /text-align/.test(hidden), hidden);

// 懒加载：只有 data-src 时补 src
const lazy = sanitizeContent('<p><img data-src="https://mmbiz.qpic.cn/a.png" alt="图"></p>');
const picked = imgUrlOf(lazy);
check("data-src only 补成 src", picked.url === "https://mmbiz.qpic.cn/a.png" && picked.from === "src", lazy);
check("data-src 属性不残留", !/data-src/.test(lazy), lazy);

// 正常排版必须保留
const normal = sanitizeContent(
  '<div id="js_content"><h2>标题</h2><p>正文<strong>加粗</strong><a href="https://mp.weixin.qq.com/s?x=1">链接</a></p>' +
    '<table><tr><td colspan="2">单元格</td></tr></table><img src="https://mmbiz.qpic.cn/b.png"></div>'
);
for (const keep of ["<h2>", "<p>", "<strong>", "<table>", "<td", "<img", "https://mp.weixin.qq.com/s?x=1"]) {
  check("保留正常结构 " + keep, normal.includes(keep), normal);
}

// 正文抽取仍按 div 配对
const page =
  '<html><body><div id="js_content"><div><p>段落一</p></div><div><p>段落二</p></div></div><div>外部</div></body></html>';
const content = extractJsContent(page);
check("extractJsContent 配对抽取", content !== null && content.includes("段落二") && !content.includes("外部"), String(content));

// 纯文本化：标签不残留、实体还原
const text = htmlToText("<p>A&amp;B</p><p>C</p>");
check("htmlToText 实体还原", text === "A&B C", text);

// 清洗后正文仍可读（长度不塌）
const longText = "测试正文".repeat(50);
const kept = sanitizeContent("<p>" + longText + "</p>");
check("清洗不吞正文", htmlToText(kept).length === longText.length, String(htmlToText(kept).length));

// ---- 离线快照整页加固（导入外部 HTML 时用） ----
const offlineInput =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><base href="https://evil.example/">' +
  '<link rel="stylesheet" href="https://evil.example/x.css"><title>t</title></head><body>' +
  '<script>alert(1)</script><iframe src="https://evil.example/"></iframe>' +
  '<p onclick="steal()">正文</p><img src="data:image/png;base64,iVBORw0KGgo=" onerror="alert(1)">' +
  '<a href="javascript:alert(1)">链接</a><div style="color:red">带样式</div></body></html>';
const hardened = hardenOfflineHtml(offlineInput);
for (const bad of ["<script", "<iframe", "<base", "<link", "onclick", "onerror", "javascript:", "evil.example"]) {
  check("整页加固移除 " + bad, !hardened.toLowerCase().includes(bad.toLowerCase()), hardened.slice(0, 200));
}
check("整页加固保留内嵌图片", /src="data:image\/png/.test(hardened), hardened.slice(0, 200));
check("整页加固保留样式", /color:red/.test(hardened), hardened.slice(0, 200));
check("整页加固注入 CSP", /Content-Security-Policy/.test(hardened), hardened.slice(0, 200));
check("整页加固保留正文", hardened.includes("正文") && hardened.includes("带样式"));

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
