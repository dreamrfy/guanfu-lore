import { afterEach, describe, expect, it, vi } from "vitest";
import { repo } from "./db";
import {
  DEFAULT_CLIP_SERVER,
  loadClipServerUrl,
  loadClipToken,
  requestClip,
  saveClipServerUrl,
  saveClipToken,
} from "./clipApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("剪藏服务客户端", () => {
  it("没配置时用默认地址，配置后读回", async () => {
    expect(await loadClipServerUrl()).toBe(DEFAULT_CLIP_SERVER);
    await saveClipServerUrl("http://127.0.0.1:9000");
    expect(await loadClipServerUrl()).toBe("http://127.0.0.1:9000");
    await saveClipServerUrl(DEFAULT_CLIP_SERVER);
  });

  it("Token 存了就会带上 Authorization 头", async () => {
    await saveClipToken("tok-123");
    expect(await loadClipToken()).toBe("tok-123");
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, clip: {}, contentHtml: "", snapshotHtml: null, assets: [] }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    await requestClip("https://mp.weixin.qq.com/s?__biz=a");
    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
    await saveClipToken("");
  });

  it("服务端拒绝（401）时给出可操作提示", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 401 })));
    const result = await requestClip("https://mp.weixin.qq.com/s?__biz=a");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unauthorized");
      expect(result.error).toContain("Token");
    }
  });

  it("服务没起来时给人话提示，而不是抛异常", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
    const result = await requestClip("https://mp.weixin.qq.com/s?__biz=a");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("server_unreachable");
      expect(result.error).toContain("node src/clipServer.ts");
    }
  });

  it("返回非 JSON 时明确报错", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("<html>oops</html>", { status: 502 }))
    );
    const result = await requestClip("https://mp.weixin.qq.com/s?__biz=a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("bad_response");
  });

  it("成功时原样返回服务端载荷", async () => {
    const payload = { ok: true, clip: { id: "wx_1", title: "标题" }, contentHtml: "<p>x</p>", snapshotHtml: null, assets: [] };
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }))
    );
    const result = await requestClip("https://mp.weixin.qq.com/s?__biz=a");
    expect(result).toEqual(payload);
    await repo.setMeta("clipServerUrl", DEFAULT_CLIP_SERVER);
  });
});
