import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, repo } from "./db";
import {
  collectAssetRefs,
  extFromMime,
  fetchMissingAssets,
  getUploadedAssets,
  syncAssetsForChanges,
  syncAssetsFromChanges,
  uploadPendingAssets,
} from "./assetSync";

const PNG = new ArrayBuffer(8);
const GIF = new ArrayBuffer(4);

async function putAsset(id: string, mime: string, data: ArrayBuffer): Promise<void> {
  await db.assets.put({ id, pageId: null, kind: "image", mime, size: data.byteLength, data, createdAt: Date.now() });
}

/** 记录请求并按脚本返回响应的 fetch 桩 */
function stubFetch(script: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Array<{ url: string; body?: ArrayBuffer }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const step = script[calls.length] ?? { status: 200, body: { ok: true } };
    calls.push({ url, body: init?.body as ArrayBuffer | undefined });
    if (step instanceof Error) throw step;
    return new Response(JSON.stringify(step.body ?? { ok: true }), {
      status: step.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  await repo.setMeta("syncUploadedAssets", {});
  await db.assets.clear();
});

describe("extFromMime", () => {
  it("四种图片 mime 映射到服务端白名单 ext", () => {
    expect(extFromMime("image/png")).toBe("png");
    expect(extFromMime("image/jpeg")).toBe("jpg");
    expect(extFromMime("image/gif")).toBe("gif");
    expect(extFromMime("image/webp")).toBe("webp");
  });
  it("非图片 mime 返回 null", () => {
    expect(extFromMime("application/pdf")).toBeNull();
    expect(extFromMime("text/plain")).toBeNull();
  });
});

describe("collectAssetRefs", () => {
  it("收集 blocks 任意层级的 asset:// 引用 + coverAssetId 裸 id，且去重", () => {
    const payload = {
      page: { id: "p1", coverAssetId: "a-cover" },
      blocks: [
        { type: "image", src: "asset://a-1" },
        { type: "gallery", items: [{ src: "asset://a-2" }, { src: "asset://a-1" }] },
        { type: "text", text: "普通文本 asset:// 不完整引用" },
      ],
    };
    const ids = collectAssetRefs(payload);
    expect(ids.sort()).toEqual(["a-1", "a-2", "a-cover"]);
  });
  it("空引用（asset:// 后面没 id）不收集", () => {
    expect(collectAssetRefs({ src: "asset://" })).toEqual([]);
  });
});

describe("uploadPendingAssets", () => {
  it("上传图片附件并记标记；第二次调用直接跳过（不再发请求）", async () => {
    await putAsset("a-1", "image/png", PNG);
    await putAsset("a-2", "image/gif", GIF);
    const { calls, fetchMock } = stubFetch([{ status: 200 }, { status: 200 }]);

    const first = await uploadPendingAssets(["a-1", "a-2"]);
    expect(first.uploaded.sort()).toEqual(["a-1", "a-2"]);
    expect(first.failed).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain("/api/sync/assets?assetId=a-1&ext=png");
    expect(calls[1]!.url).toContain("/api/sync/assets?assetId=a-2&ext=gif");

    const markers = await getUploadedAssets();
    expect(Object.keys(markers).sort()).toEqual(["a-1", "a-2"]);

    const second = await uploadPendingAssets(["a-1", "a-2"]);
    expect(second.uploaded).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("上传失败 → 进 failed，不记标记，下一个附件继续传", async () => {
    await putAsset("a-1", "image/png", PNG);
    await putAsset("a-2", "image/png", PNG);
    const { calls } = stubFetch([{ status: 500 }, { status: 200 }]);

    const outcome = await uploadPendingAssets(["a-1", "a-2"]);
    expect(outcome.failed).toEqual(["a-1"]);
    expect(outcome.uploaded).toEqual(["a-2"]);
    expect(calls).toHaveLength(2);
    expect(Object.keys(await getUploadedAssets())).toEqual(["a-2"]);
  });

  it("本地无字节或非图片 mime → skipped，不发请求", async () => {
    await putAsset("a-doc", "application/pdf", PNG);
    const { fetchMock } = stubFetch([]);

    const outcome = await uploadPendingAssets(["a-missing", "a-doc"]);
    expect(outcome.skipped.sort()).toEqual(["a-doc", "a-missing"]);
    expect(outcome.uploaded).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("syncAssetsForChanges", () => {  it("只处理 page+upsert，收集 payload 里的附件引用去重后补传", async () => {
    await putAsset("a-1", "image/png", PNG);
    const { calls } = stubFetch([{ status: 200 }]);

    const outcome = await syncAssetsForChanges([
      { entity: "collection", op: "upsert", payload: { src: "asset://a-ignore" } },
      { entity: "page", op: "delete", payload: { src: "asset://a-ignore" } },
      {
        entity: "page",
        op: "upsert",
        payload: { page: { coverAssetId: "a-1" }, blocks: [{ src: "asset://a-1" }] },
      },
    ]);
    expect(outcome.uploaded).toEqual(["a-1"]);
    expect(calls).toHaveLength(1);
  });

  it("没有任何 page 改动 → 不发请求", async () => {
    const { fetchMock } = stubFetch([]);
    const outcome = await syncAssetsForChanges([
      { entity: "record", op: "upsert", payload: {} },
    ]);
    expect(outcome.uploaded).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchMissingAssets（S03 拉取端）", () => {
  /** 资产下载桩：按 assetId 脚本返回字节/状态 */
  function stubAssetFetch(script: Record<string, { status: number; mime: string; bytes?: ArrayBuffer }>) {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      const id = decodeURIComponent(url.split("/api/sync/assets/")[1] ?? "");
      const step = script[id];
      if (!step) return new Response("not found", { status: 404 });
      return new Response(step.bytes ?? new ArrayBuffer(0), {
        status: step.status,
        headers: { "Content-Type": step.mime },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { urls, fetchMock, script };
  }

  it("本地缺 → GET 取回落库（保远端 id、mime 取自响应头）；已有 → 跳过不发请求", async () => {
    await repo.setMeta("clipToken", "t");
    await db.assets.put({ id: "a-existing", pageId: null, kind: "image", mime: "image/png", size: 2, data: new ArrayBuffer(2), createdAt: 0 });
    const bytes = new ArrayBuffer(12);
    const { urls, fetchMock } = stubAssetFetch({
      "a-1": { status: 200, mime: "image/png", bytes },
    });

    const outcome = await fetchMissingAssets(["a-1", "a-existing"], "p-1");
    expect(outcome.fetched).toEqual(["a-1"]);
    expect(outcome.missing).toEqual([]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/api/sync/assets/a-1");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: "Bearer t" });

    const row = await repo.getAsset("a-1");
    expect(row?.mime).toBe("image/png");
    expect(row?.size).toBe(12);
    expect(row?.kind).toBe("image");
    expect(row?.pageId).toBe("p-1");

    // 本地已有 → 再调不发请求
    const again = await fetchMissingAssets(["a-1"], null);
    expect(again.fetched).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("服务端 404 或非图片 Content-Type → missing，不落库", async () => {
    const { fetchMock } = stubAssetFetch({
      "a-404": { status: 404, mime: "text/plain" },
      "a-junk": { status: 200, mime: "application/octet-stream", bytes: new ArrayBuffer(4) },
    });

    const outcome = await fetchMissingAssets(["a-404", "a-junk"], null);
    expect(outcome.missing.sort()).toEqual(["a-404", "a-junk"]);
    expect(outcome.fetched).toEqual([]);
    expect(await repo.getAsset("a-404")).toBeNull();
    expect(await repo.getAsset("a-junk")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("syncAssetsFromChanges（S03 编排）", () => {
  it("只看 page+upsert，按第一个引用它的页面归属补缺", async () => {
    const bytes = new ArrayBuffer(6);
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(bytes, { status: 200, headers: { "Content-Type": "image/gif" } });
      })
    );

    const outcome = await syncAssetsFromChanges([
      { entity: "record", entityId: "r-1", op: "upsert", payload: { src: "asset://x" } },
      { entity: "page", entityId: "p-A", op: "delete", payload: { src: "asset://x" } },
      { entity: "page", entityId: "p-A", op: "upsert", payload: { blocks: [{ src: "asset://a-1" }] } },
      { entity: "page", entityId: "p-B", op: "upsert", payload: { page: { coverAssetId: "a-2" } } },
    ]);
    expect(outcome.fetched.sort()).toEqual(["a-1", "a-2"]);
    expect(urls).toHaveLength(2);

    const row = await repo.getAsset("a-2");
    expect(row?.pageId).toBe("p-B");
  });
});
