import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, repo } from "./db";
import {
  collectAssetRefs,
  extFromMime,
  getUploadedAssets,
  syncAssetsForChanges,
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

describe("syncAssetsForChanges", () => {
  it("只处理 page+upsert，收集 payload 里的附件引用去重后补传", async () => {
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
