import { describe, expect, it } from "vitest";
import { rewriteSnapshotImages } from "./clipBox";

describe("剪藏箱：快照图片引用改写", () => {
  it("已知文件名换成 asset://，未知的保持原样", () => {
    const html = '<p><img src="abc123.png"><img src="https://cdn/x.png"></p>';
    const out = rewriteSnapshotImages(html, new Map([["abc123.png", "asset://local-1"]]));
    expect(out).toContain('src="asset://local-1"');
    expect(out).toContain('src="https://cdn/x.png"');
  });

  it("没有映射时原样返回", () => {
    const html = '<img src="abc123.png">';
    expect(rewriteSnapshotImages(html, new Map())).toBe(html);
  });
});
