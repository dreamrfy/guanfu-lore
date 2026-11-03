// 任务3 自测：对 samples/messages.json 全量解析
// 用法: node tests/parse.selftest.ts
import fs from "node:fs";
import path from "node:path";
import { parseKfMessage } from "../src/sources/wecomMessage.ts";

const samplesPath = path.resolve(import.meta.dirname ?? ".", "..", "samples", "messages.json");
const data = JSON.parse(fs.readFileSync(samplesPath, "utf8")) as { messages: Array<Record<string, unknown>> };

let parsed = 0;
let unrecognized = 0;
console.log("条目  类型            来源平台        标题/内容");
for (const [i, msg] of data.messages.entries()) {
  const item = parseKfMessage(msg);
  if (item === null) {
    unrecognized += 1;
    console.log(`${String(i + 1).padStart(3)}  无法识别（msgtype=${String(msg.msgtype)}）`);
    continue;
  }
  parsed += 1;
  console.log(
    `${String(i + 1).padStart(3)}  ${String(msg.msgtype).padEnd(6)} ${item.source.padEnd(12)} ${item.title.slice(0, 46)}`
  );
}
console.log(`\n合计: 样本 ${data.messages.length} 条 | 识别 ${parsed} | 未识别 ${unrecognized}`);
if (parsed === 0) {
  console.error("全部未识别——解析有 bug");
  process.exitCode = 1;
}
