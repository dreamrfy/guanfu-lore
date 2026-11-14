import { describe, expect, it } from "vitest";
import type { CollectionRow } from "./db";
import type { ClipPayload } from "./clipApi";
import {
  buildClipValues,
  clipLinkKey,
  extractSnapshotContent,
  rewriteClipImages,
  sourceLabel,
  textToBlocks,
} from "./clipIngest";
import { makeCollection, makeField } from "./collections";

const clip = (overrides: Partial<ClipPayload> = {}): ClipPayload => ({
  id: "wx_1",
  source: "wechat_mp",
  sourceUrl: "https://mp.weixin.qq.com/s?__biz=a&mid=1&idx=1&sn=s",
  canonicalUrl: null,
  title: "极简热榜",
  author: "作者甲",
  account: "科技汤",
  publishedAt: null,
  savedAt: "2026-11-12T08:00:00.000Z",
  text: "正文",
  status: "complete",
  ...overrides,
});

/** 造一张和 store.ensureClipCollection 同结构的表 */
function clipCollection(): CollectionRow {
  const base = makeCollection("剪藏库");
  const source = {
    ...makeField("select", "来源"),
    options: [
      { id: "src-wx", name: "公众号", color: "green" },
      { id: "src-bili", name: "B站", color: "pink" },
      { id: "src-other", name: "其他", color: "grey" },
    ],
  };
  const status = {
    ...makeField("select", "状态"),
    options: [
      { id: "st-unread", name: "未读", color: "blue" },
      { id: "st-read", name: "已读", color: "grey" },
    ],
  };
  return {
    ...base,
    fields: [base.fields[0], source, makeField("text", "作者"), makeField("url", "原文链接"), makeField("date", "收藏时间"), status],
  };
}

describe("剪藏：图片引用改写", () => {
  it("只替换映射到的文件名，其余保持原样", () => {
    const html = '<p><img src="aaa.png"><img src="https://mmbiz.qpic.cn/x.png"></p>';
    const out = rewriteClipImages(html, new Map([["aaa.png", "asset://new1"]]));
    expect(out).toContain('src="asset://new1"');
    expect(out).toContain('src="https://mmbiz.qpic.cn/x.png"');
  });
});

describe("剪藏：从快照里取正文", () => {
  it("去掉标题、来源行与脚本，保留文章主体", () => {
    const snapshot = `<!doctype html><html><body>
      <h1>文章标题</h1>
      <div class="meta">公众号 · 发布于 2026-11-01</div>
      <p>第一段</p>
      <script>alert(1)</script>
    </body></html>`;
    const content = extractSnapshotContent(snapshot);
    expect(content).toContain("第一段");
    expect(content).not.toContain("文章标题");
    expect(content).not.toContain("发布于");
    expect(content).not.toContain("script");
  });
});

describe("剪藏：元数据型正文兜底", () => {
  it("按换行拆成段落块，过滤空行", () => {
    const blocks = textToBlocks("第一行\n\n第二行\n   \n第三行");
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
  });
});

describe("剪藏：判重用的链接指纹", () => {
  it("同一篇公众号：分享参数与 == 的编码方式不影响判重", () => {
    const shared =
      "https://mp.weixin.qq.com/s?__biz=MzA5==&mid=10&idx=1&sn=abc&mpshare=1&scene=1&srcid=xyz#rd";
    const plain = "https://mp.weixin.qq.com/s?__biz=MzA5%3D%3D&mid=10&idx=1&sn=abc";
    expect(clipLinkKey(shared)).toBe(clipLinkKey(plain));
  });

  it("mid 不同就是两篇", () => {
    expect(clipLinkKey("https://mp.weixin.qq.com/s?__biz=MzA5==&mid=10&idx=1&sn=abc")).not.toBe(
      clipLinkKey("https://mp.weixin.qq.com/s?__biz=MzA5==&mid=11&idx=1&sn=abc")
    );
  });

  it("非公众号：去掉 # 后比较", () => {
    expect(clipLinkKey("https://www.bilibili.com/video/BV1xx#reply1")).toBe(
      clipLinkKey("https://www.bilibili.com/video/BV1xx")
    );
  });
});

describe("剪藏：来源映射", () => {
  it("公众号 / B站 / 其他", () => {
    expect(sourceLabel("wechat_mp")).toBe("公众号");
    expect(sourceLabel("bilibili")).toBe("B站");
    expect(sourceLabel("douyin")).toBe("其他");
  });
});

describe("剪藏：记录属性", () => {
  it("按字段名填值，来源与状态用选项 id", () => {
    const collection = clipCollection();
    const values = buildClipValues(collection, clip());
    const byName = (name: string) => collection.fields.find((f) => f.name === name)!.id;

    expect(values[byName("标题")]).toBe("极简热榜");
    expect(values[byName("来源")]).toBe("src-wx");
    expect(values[byName("作者")]).toBe("作者甲");
    expect(values[byName("原文链接")]).toContain("mp.weixin.qq.com");
    expect(values[byName("状态")]).toBe("st-unread");
    expect(values[byName("收藏时间")]).toBe(Date.parse("2026-11-12T08:00:00.000Z"));
  });

  it("B站用 B站选项；没有作者时退回公众号名", () => {
    const collection = clipCollection();
    const values = buildClipValues(collection, clip({ source: "bilibili", author: "" }));
    const byName = (name: string) => collection.fields.find((f) => f.name === name)!.id;
    expect(values[byName("来源")]).toBe("src-bili");
    expect(values[byName("作者")]).toBe("科技汤");
  });
});
