// 多来源降级字段自测（任务11）：对真实样本里的抖音/小红书消息，
// 验证「标题 / 标签 / 作者 / 封面」抽取，并打印明细表。
//
// 运行：node tests/degrade.selftest.ts   （或经 tests/run-all.sh）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseKfMessage } from "../src/sources/wecomMessage.ts";
import type { NormalizedItem } from "../src/store/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const samples = JSON.parse(readFileSync(join(here, "..", "samples", "messages.json"), "utf-8"));

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail: string) => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label} —— ${detail}`); }
};

const items: Array<{ idx: number; item: NormalizedItem }> = [];
for (let i = 0; i < samples.messages.length; i++) {
  const item = parseKfMessage(samples.messages[i]);
  if (item) items.push({ idx: i, item });
}

console.log(`\n解析 ${samples.messages.length} 条样本 → 识别 ${items.length} 条\n`);

console.log("平台         标题                          作者       标签                  封面");
console.log("-".repeat(90));
for (const { item } of items) {
  if (item.source === "wechat_mp") continue; // 公众号已在 parse 自测覆盖，这里只看降级来源
  const tags = (item.tags ?? []).join("/") || "-";
  const author = item.author || "-";
  const cover = item.coverUrl ? "有" : "-";
  console.log(
    item.source.padEnd(12),
    item.title.slice(0, 26).padEnd(28),
    author.padEnd(10),
    tags.slice(0, 20).padEnd(22),
    cover,
  );
}

// —— 断言：抖音 text（样本 #13）——
const douyin = items.find((x) => x.item.source === "douyin");
check("抖音：识别出条目", !!douyin, "样本里没有 douyin 条目");
if (douyin) {
  check("抖音：标题取【】后的正文标题", douyin.item.title === "莱昂纳少太有腔调了", `实际="${douyin.item.title}"`);
  check("抖音：作者=咖喱（从「咖喱的图文作品」剥出）", douyin.item.author === "咖喱", `实际="${douyin.item.author}"`);
  check("抖音：标签含 小李子", (douyin.item.tags ?? []).includes("小李子"), `实际=${JSON.stringify(douyin.item.tags)}`);
  check("抖音：标签含 莱昂纳多", (douyin.item.tags ?? []).includes("莱昂纳多"), `实际=${JSON.stringify(douyin.item.tags)}`);
  check("抖音：无封面（text 形态没有图）", !douyin.item.coverUrl, `实际="${douyin.item.coverUrl}"`);
  check("抖音：note 写明阶段二", (douyin.item.note ?? "").includes("阶段二"), `实际="${douyin.item.note}"`);
}

// —— 断言：小红书 link（样本 #11）——
const xhsLink = items.find((x) => x.item.source === "xiaohongshu" && x.item.coverUrl);
check("小红书 link：识别出条目", !!xhsLink, "样本里没有带封面的 xiaohongshu 条目");
if (xhsLink) {
  check("小红书 link：作者=可可姜姜（从「@xxx 的笔记」抽出）", xhsLink.item.author === "可可姜姜", `实际="${xhsLink.item.author}"`);
  check("小红书 link：标题保留卡片标题", xhsLink.item.title.includes("基金从业"), `实际="${xhsLink.item.title}"`);
  check("小红书 link：封面有值", !!xhsLink.item.coverUrl, "pic_url 丢失");
  check("小红书 link：note 写明阶段二", (xhsLink.item.note ?? "").includes("阶段二"), `实际="${xhsLink.item.note}"`);
}

// —— 断言：小红书 text 短链（样本 #12）——
const xhsText = items.find((x) => x.item.source === "xiaohongshu" && x.item.sourceUrl.includes("xhslink.cn"));
check("小红书 text：识别出短链条目", !!xhsText, "样本里没有 xhslink.cn 条目");
if (xhsText) {
  check("小红书 text：标题取第一段", xhsText.item.title.startsWith("独家福利"), `实际="${xhsText.item.title}"`);
  check("小红书 text：无封面（text 形态没有图）", !xhsText.item.coverUrl, `实际="${xhsText.item.coverUrl}"`);
}

// —— 公众号不受影响（回归）——
const mp = items.find((x) => x.item.source === "wechat_mp");
check("公众号：回归无损（仍识别且 capability=full）", !!mp && mp.item.capability === "full", "公众号条目异常");

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
