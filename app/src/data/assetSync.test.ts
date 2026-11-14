import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, repo } from "./db";
import { useStore } from "./store";
import { releaseAssetUrls } from "./assets";
import { runSync } from "./sync";
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
  releaseAssetUrls();
  useStore.setState({ ready: true, pages: [], trash: [], docs: {}, tabs: [], activeTabId: null });
  await repo.setMeta("syncUploadedAssets", {});
  await db.assets.clear();
});

describe("setBlocks 同步 payload（S04 端到端逮到的 bug 回归）", () => {
  it("入队的 payload 里 blob: 地址必须换回 asset://，附件引用可被 collectAssetRefs 收到", async () => {
    const pageId = await useStore.getState().createPage(null, []);
    const file = new File([new Uint8Array([137, 80, 78, 71])], "t.png", { type: "image/png" });
    const blobUrl = await useStore.getState().uploadFile(file, "image", null);
    expect(blobUrl).toMatch(/^blob:/);

    useStore.getState().setBlocks(pageId, [
      { type: "paragraph", content: [{ type: "text", text: "hi", styles: {} }] },
      { type: "image", props: { url: blobUrl } },
    ] as never);
    // 入队是异步合并的（同一页只留最新一条），等一拍再查
    await new Promise((r) => setTimeout(r, 80));

    const outbox = await repo.listOutbox();
    const pageRow = outbox.find((r) => r.entity === "page" && r.entityId === pageId);
    expect(pageRow).toBeDefined();
    const payload = pageRow!.payload as { blocks: Array<{ type?: string; props?: { url?: string } }> };
    console.log("DEBUG payload blocks:", JSON.stringify(payload.blocks));
    const img = payload.blocks.find((b) => b.type === "image");
    expect(img?.props?.url).toMatch(/^asset:\/\//);
    expect(JSON.stringify(payload)).not.toContain("blob:");

    // 附件引用能被 S02 的收集函数看到（否则图片永远传不出去）
    const { collectAssetRefs } = await import("./assetSync");
    expect(collectAssetRefs(payload)).toContain(img!.props!.url!.slice("asset://".length));
  });
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

describe("runSync 自回声防护（S04 端到端逮到的 bug 回归）", () => {
  /** 按 URL 路由的 fetch 桩：pull 给脚本、push/assets 给 OK */
  function stubSyncFetch(pullChanges: unknown[]) {
    const pushes: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/sync/pull")) {
        return new Response(JSON.stringify({ ok: true, changes: pullChanges, nextSeq: 9 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/api/sync/push")) {
        pushes.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true, results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { pushes };
  }

  it("本地有 pending 改动的行：远端变更不写库不入内存，seq 照常推进；无 pending 的行正常应用", async () => {
    await repo.setMeta("clipServerUrl", "http://127.0.0.1:8787");
    await repo.setMeta("clipToken", "t");
    await repo.setMeta("syncCursor", 0);
    await repo.setMeta("syncSeqs", {});
    await repo.setMeta("syncUploadedAssets", {});
    await repo.clearOutbox();
    await db.assets.clear();

    // 本地行（用户刚改过标题，还在 outbox 里待推）
    await db.pages.put({
      id: "p-local", parentId: null, title: "本地新标题", icon: null,
      createdAt: 1, updatedAt: 2, deletedAt: null, sortKey: 1,
    });
    const { enqueueChange } = await import("./sync");
    await enqueueChange({
      entity: "page",
      entityId: "p-local",
      op: "upsert",
      payload: { page: { id: "p-local", title: "本地新标题" }, blocks: [] },
    });

    stubSyncFetch([
      { seq: 8, entity: "page", entityId: "p-local", op: "upsert", payload: JSON.stringify({ page: { id: "p-local", title: "远端标题" }, blocks: [] }), actor: "other", baseSeq: 0, createdAt: 1 },
      { seq: 9, entity: "page", entityId: "p-clean", op: "upsert", payload: JSON.stringify({ page: { id: "p-clean", parentId: null, title: "远端页面", icon: null, createdAt: 1, updatedAt: 2, deletedAt: null, sortKey: 1 }, blocks: [] }), actor: "other", baseSeq: 0, createdAt: 1 },
    ]);

    const summary = await runSync();
    expect(summary.ok).toBe(true);
    // pending 行：不进 applied、库里标题保持本地版
    expect(summary.applied.find((c) => c.entityId === "p-local")).toBeUndefined();
    expect((await db.pages.get("p-local"))?.title).toBe("本地新标题");
    // 无 pending 行：正常应用
    expect(summary.applied.find((c) => c.entityId === "p-clean")).toBeDefined();
    expect((await db.pages.get("p-clean"))?.title).toBe("远端页面");
    // seq 游标照常推进（两条都算拉过）
    expect(await repo.getMeta<number>("syncCursor")).toBe(9);
    expect(summary.pulled).toBe(2);
    // pending 行仍留在 outbox，推送时由乐观锁处理
    const outbox = await repo.listOutbox();
    expect(outbox.some((r) => r.entityId === "p-local")).toBe(true);
  });
});
