/**
 * 划线定位器（H01）回归测试。
 *
 * 被测对象 extension/locator.js 是浏览器扩展用的原生 JS（UMD，给 content.js
 * 当全局用），测试借 createRequire 按 CJS 直接加载，跟本套件的 jsdom 环境配合
 * ——所以 buildTextQuoteSelector 的 DOM 用例能真实跑 TreeWalker。
 */
import { describe, expect, it } from "vitest";
// 仓库没装 @types/node，这里只为加载扩展的 UMD 文件用一次 createRequire，压掉模块解析报错
// @ts-expect-error node:module 需要额外的 node 类型定义，本仓库刻意不装
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const locator = req("../../../extension/locator.js") as {
  buildTextQuoteSelector: (
    root: Element,
    range: Range
  ) => { exact: string; prefix: string; suffix: string } | null;
  matchInText: (text: string, sel: { exact: string; prefix?: string; suffix?: string }) => number;
};

function textNodeOf(el: Element): Text {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const n = w.nextNode();
  if (!n) throw new Error("没有文本节点");
  return n as Text;
}

describe("划线定位器（H01 quoted fragment）", () => {
  it("matchInText：prefix+suffix 能在重复文本里锁定正确位置", () => {
    const text = "第一段。目标句子在这里。第二段。目标句子在这里。结尾。";
    const first = text.indexOf("目标句子在这里");
    const second = text.indexOf("目标句子在这里", first + 1);
    const sel = {
      exact: "目标句子在这里",
      prefix: "第二段。", // 只有第二处的上下文对得上
      suffix: "结尾。",
    };
    expect(locator.matchInText(text, sel)).toBe(second);
    expect(locator.matchInText(text, { exact: "目标句子在这里" })).toBe(first);
    expect(locator.matchInText(text, { exact: "不存在的句子" })).toBe(-1);
  });

  it("matchInText：空白折叠——快照里的换行缩进不影响命中", () => {
    const snapshot = "<p>第一行：\n    关键   结论在此。</p>";
    const plain = snapshot.replace(/<[^>]+>/g, " ");
    expect(locator.matchInText(plain, { exact: "关键 结论在此" })).toBeGreaterThan(-1);
  });

  it("buildTextQuoteSelector：普通选区给出 exact/prefix/suffix", () => {
    document.body.innerHTML =
      "<article><p id='p'>前缀铺垫文字，足够长以供引文。重复出现的锚点句只此一次出现，后文线索紧跟其后。</p></article>";
    const p = document.getElementById("p")!;
    const node = textNodeOf(p);
    const raw = (node.nodeValue ?? "").replace(/\s+/g, " ");
    const start = raw.indexOf("锚点句只此一次出现");
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + "锚点句只此一次出现".length);
    const sel = locator.buildTextQuoteSelector(document.body, range);
    expect(sel).not.toBeNull();
    expect(sel!.exact).toBe("锚点句只此一次出现");
    // prefix = 选中处前面最多 32 个字符；本文前置不足 32 字，就是从头开始
    const before = raw.slice(0, start);
    expect(sel!.prefix).toBe(before.slice(-32));
    expect(sel!.suffix.startsWith("，后文线索")).toBe(true);
  });

  it("buildTextQuoteSelector + matchInText：跨段落选区在折叠空白后的快照里能找回", () => {
    document.body.innerHTML =
      "<article><p>第一段以锚点句收尾。</p><p>第二段以线索句开头。</p></article>";
    const ps = document.querySelectorAll("p");
    const n1 = textNodeOf(ps[0]);
    const n2 = textNodeOf(ps[1]);
    const s1 = (n1.nodeValue ?? "").indexOf("锚点句");
    const e2 = (n2.nodeValue ?? "").indexOf("开头。") + "开头。".length;
    const range = document.createRange();
    range.setStart(n1, s1);
    range.setEnd(n2, e2);

    const sel = locator.buildTextQuoteSelector(document.body, range);
    expect(sel).not.toBeNull();
    expect(sel!.exact).toBe("锚点句收尾。 第二段以线索句开头。"); // 跨元素折叠成一个空格

    // 模拟快照文本（空白/换行和原页面不同）
    const snapshotText = "第一段以锚点句收尾。\n\n    第二段以线索句开头。\n（后续内容）";
    expect(locator.matchInText(snapshotText, sel!)).toBe(snapshotText.indexOf("锚点句"));
  });

  it("buildTextQuoteSelector：空选区 / 无文本根返回 null", () => {
    document.body.innerHTML = "<p>内容</p>";
    const node = textNodeOf(document.querySelector("p")!);
    const same = document.createRange();
    same.setStart(node, 2);
    same.setEnd(node, 2);
    expect(locator.buildTextQuoteSelector(document.body, same)).toBeNull();
    expect(locator.matchInText("任何文本", { exact: "" })).toBe(-1);
  });
});
