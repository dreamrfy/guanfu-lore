// 消息解析健壮性自测（P1-02）：非法输入一律返回 null，且不抛异常
// 用法: node tests/message.selftest.ts
import { parseKfMessage, safeParseUrl, platformOfHost } from "../src/sources/wecomMessage.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function mustReturnNull(name: string, msg: unknown): void {
  let result: unknown = "unset";
  let threw = false;
  try {
    result = parseKfMessage(msg as Record<string, unknown>);
  } catch (e) {
    threw = true;
  }
  check(name, !threw && result === null, threw ? "抛出了异常" : "返回了 " + JSON.stringify(result));
}

// 非法 / 未知输入
mustReturnNull("link 非法 URL", { msgtype: "link", link: { url: "not-a-url" } });
mustReturnNull("link 空 URL", { msgtype: "link", link: { url: "" } });
mustReturnNull("link 缺 url 字段", { msgtype: "link", link: {} });
mustReturnNull("link 缺 link 字段", { msgtype: "link" });
mustReturnNull("link 未知 host", { msgtype: "link", link: { url: "https://example.com/x" } });
mustReturnNull("link 非 http 协议", { msgtype: "link", link: { url: "ftp://mp.weixin.qq.com/s" } });
mustReturnNull("link javascript: 协议", { msgtype: "link", link: { url: "javascript:alert(1)" } });
mustReturnNull("text 空内容", { msgtype: "text", text: { content: "" } });
mustReturnNull("text 无链接", { msgtype: "text", text: { content: "今天天气不错" } });
mustReturnNull("text 只有未知 host 链接", { msgtype: "text", text: { content: "看看 https://example.com/a" } });
mustReturnNull("text 缺 text 字段", { msgtype: "text" });
mustReturnNull("未知 msgtype", { msgtype: "image", image: { url: "https://mp.weixin.qq.com/s" } });
mustReturnNull("事件消息", { msgtype: "event", event: { event_type: "enter_session" } });
mustReturnNull("空对象", {});
mustReturnNull("null 消息", null);
mustReturnNull("超长 URL", { msgtype: "link", link: { url: "https://mp.weixin.qq.com/" + "a".repeat(5000) } });

// 正常输入仍要能解析（回归）
const okLink = parseKfMessage({
  msgtype: "link",
  link: { url: "https://mp.weixin.qq.com/s?__biz=a&mid=1&idx=1&sn=b", title: "标题", desc: "", pic_url: "" },
});
check("正常 link 仍可解析", okLink !== null && okLink.source === "wechat_mp" && okLink.capability === "full");

// text 里有多个链接：取第一个平台已知的
const multi = parseKfMessage({
  msgtype: "text",
  text: { content: "先看这个 https://example.com/x 再看 https://b23.tv/abc" },
});
check("多链接取第一个已知平台", multi !== null && multi.source === "bilibili", JSON.stringify(multi));

// 短链形态
const shortXhs = parseKfMessage({ msgtype: "text", text: { content: "复制打开小红书 https://xhslink.cn/o/abc" } });
check("小红书短链识别", shortXhs !== null && shortXhs.source === "xiaohongshu" && shortXhs.capability === "metadata-only");

// safeParseUrl 自身不抛异常
for (const raw of ["", "://", "http://", "https://", "http://[::1", "   ", "http://a b"]) {
  let threw = false;
  try {
    safeParseUrl(raw);
  } catch {
    threw = true;
  }
  check("safeParseUrl 不抛异常：" + JSON.stringify(raw), !threw);
}

check("platformOfHost 未知返回 unknown", platformOfHost("example.com") === "unknown");
check("platformOfHost 大小写无关", platformOfHost("MP.WEIXIN.QQ.COM") === "wechat_mp");

// 极长文案不崩
const longText = "前缀".repeat(5000) + " https://b23.tv/xyz";
let longOk = true;
try {
  parseKfMessage({ msgtype: "text", text: { content: longText } });
} catch {
  longOk = false;
}
check("超长文案不抛异常", longOk);

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
