import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDismissedClipLinks,
  dismissClipLink,
  extractClipLink,
  isClipLinkDismissed,
} from "./clipClipboard";

beforeEach(() => {
  localStorage.clear();
  clearDismissedClipLinks();
});

describe("剪贴板链接识别", () => {
  it("识别微信文章链接并去掉句末标点", () => {
    expect(extractClipLink("看看这个 https://mp.weixin.qq.com/s/abc?from=timeline。")).toBe(
      "https://mp.weixin.qq.com/s/abc?from=timeline",
    );
  });

  it("识别 B 站短链与普通链接", () => {
    expect(extractClipLink("https://b23.tv/AbCdEf")).toBe("https://b23.tv/AbCdEf");
    expect(extractClipLink("https://www.bilibili.com/video/BV1xx")).toBe(
      "https://www.bilibili.com/video/BV1xx",
    );
  });

  it("普通网页不弹提示", () => {
    expect(extractClipLink("https://example.com/a")).toBeNull();
    expect(extractClipLink("没有链接的一段话")).toBeNull();
  });

  it("同一条微信链接换了追踪参数也算已忽略", () => {
    const first = "https://mp.weixin.qq.com/s?__biz=a&mid=1&idx=1&sn=s&from=timeline";
    const second = "https://mp.weixin.qq.com/s?__biz=a&mid=1&idx=1&sn=s&scene=1";
    dismissClipLink(first);
    expect(isClipLinkDismissed(first)).toBe(true);
    expect(isClipLinkDismissed(second)).toBe(true);
  });
});