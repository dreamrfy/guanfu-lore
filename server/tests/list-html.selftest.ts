// 清单页渲染自测（第二轮 N-14）：失败/无资源记录不得生成空链接
// 用法: node tests/list-html.selftest.ts
import { renderListHtml } from "../src/cli.ts";
import type { Clip } from "../src/store/types.ts";

let failed = 0;
function check(name: string, ok: boolean, detail: string = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function clip(overrides: Partial<Clip>): Clip {
  return {
    id: "wx_0011223344556677",
    source: "wechat_mp",
    sourceUrl: "https://mp.weixin.qq.com/s?__biz=x&mid=1&idx=1&sn=abcdef0123456789",
    canonicalUrl: null,
    title: "标题",
    author: "",
    account: "公众号",
    publishedAt: null,
    savedAt: "2026-11-04T00:00:00.000Z",
    text: "正文",
    assets: [],
    status: "pending",
    failReason: null,
    ...overrides,
  };
}

const withSnapshot = clip({
  id: "wx_aaaabbbbccccdddd",
  title: "有快照",
  status: "complete",
  assets: [{ assetId: "aaaabbbbccccdddd", provider: "local", ext: "html" }],
});
const noSnapshot = clip({
  id: "wx_1111222233334444",
  title: "抓取失败",
  status: "failed",
  failReason: "blocked_by_platform",
  assets: [],
});
const xssTitle = clip({
  id: "wx_9999888877776666",
  title: '<script>alert(1)</script>',
  status: "partial",
  failReason: "images_failed",
  assets: [{ assetId: "9999888877776666", provider: "local", ext: "html" }],
});

const imgFirst = clip({
  id: "wx_5555444433332222",
  title: "图片排在前面",
  status: "partial",
  failReason: "images_failed",
  assets: [
    { assetId: "5555444433332222", provider: "local", ext: "png" },
    { assetId: "aaaabbbbccccdddd", provider: "local", ext: "html" },
  ],
});

const html = renderListHtml([withSnapshot, noSnapshot, xssTitle, imgFirst]);

check("有快照时生成链接", html.includes('href="') && html.includes("aaaabbbbccccdddd.html"), html.slice(0, 200));
check("无快照显示“无快照”", html.includes("无快照"));
check("T-07：图片排在前面时仍链接 HTML 快照", html.includes("aaaabbbbccccdddd.html") && !html.includes('href="5555444433332222.png"'), "链到了图片资源");
// 失败行必须没有链接：按行切开检查
const rows = html.split("<tr>").filter((r) => r.includes("抓取失败"));
check("失败行只有一行", rows.length === 1, String(rows.length));
check("失败行不含 href", rows.length === 1 && !rows[0]!.includes("href="), rows[0] ?? "");
check("失败行显示失败原因", html.includes("被平台风控拦截"), "缺少原因文案");
check("标题被 HTML 转义（无 XSS）", !html.includes("<script>alert(1)</script>"), "标题未转义");
check("状态列渲染", html.includes("complete") && html.includes("failed") && html.includes("partial"));
check("清单条数写入标题", html.includes("剪藏清单（4 条）"), "条数不对");

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
