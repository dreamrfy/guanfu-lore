/**
 * 剪藏箱自动入库（I01）回归测试
 *
 * 走真实的 store / IndexedDB（fake-indexeddb），只把网络层 fetch 按路由打桩，
 * 验证：complete 条目会导入、partial/pending 不收、重复调用幂等、服务器不可达不炸。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, type CollectionRow, type FieldDef, type RecordRow } from "./db";
import { useStore } from "./store";
import { autoImportServerClips, clipReadState, isClipUnread, unreadClipCount } from "./clipBox";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]).buffer;

const INDEX = {
  ok: true,
  clips: [
    {
      id: "clip-1",
      title: "服务器剪藏的文章",
      source: "wechat_mp",
      savedAt: "2026-11-15T06:00:00.000Z",
      status: "complete",
    },
    {
      id: "clip-2",
      title: "还在抓取中",
      source: "wechat_mp",
      savedAt: "2026-11-15T06:01:00.000Z",
      status: "partial",
    },
  ],
};

const DETAIL_1 = {
  ok: true,
  clip: {
    id: "clip-1",
    title: "服务器剪藏的文章",
    source: "wechat_mp",
    sourceUrl: "https://mp.weixin.qq.com/s/abc123",
    author: "张三",
    account: "某公众号",
    publishedAt: null,
    savedAt: "2026-11-15T06:00:00.000Z",
    text: "第一段正文。\n\n第二段正文。",
    status: "complete",
    note: "",
  },
  assets: [{ key: "2026/11/abc123.png", url: "https://r2.example/abc123.png" }],
  snapshotHtml: '<p><img src="abc123.png"></p>',
};

/** 按 URL 路由应答的剪藏服务器桩 */
function stubClipServer(opts?: { indexFail?: boolean; detailFail?: boolean }) {
  const detailCalls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/clips")) {
      if (opts?.indexFail) throw new Error("网络不通");
      return new Response(JSON.stringify(INDEX), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/clips/")) {
      detailCalls.push(url);
      if (opts?.detailFail) throw new Error("网络不通");
      return new Response(JSON.stringify(DETAIL_1), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/asset?key=")) {
      return new Response(PNG_BYTES);
    }
    throw new Error(`意外请求：${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, detailCalls };
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  // 全局 afterEach 会删库重开，内存态也要跟着清，否则上一例的剪藏库行还挂着
  useStore.setState({
    ready: true,
    pages: [],
    trash: [],
    docs: {},
    tabs: [],
    activeTabId: null,
    collections: [],
    records: {},
    activeCollectionId: null,
    openRecordRef: null,
  });
});

async function clipLibrary() {
  const store = useStore.getState();
  const collection = store.collections.find((c) => c.name === "剪藏库");
  if (!collection) return null;
  await store.ensureRecords(collection.id);
  return {
    collection,
    records: useStore.getState().records[collection.id] ?? [],
  };
}

describe("剪藏箱自动入库（I01）", () => {
  it("complete 条目自动导入：落表、落图片、落快照，状态置为未读", async () => {
    const { detailCalls } = stubClipServer();

    const result = await autoImportServerClips();

    expect(result).toEqual({ checked: 1, imported: 1 });
    expect(detailCalls).toHaveLength(1); // partial 的没去拉详情

    const lib = await clipLibrary();
    expect(lib).not.toBeNull();
    expect(lib!.records).toHaveLength(1);

    const rec = lib!.records[0];
    const field = (name: string) => lib!.collection.fields.find((f) => f.name === name)!;
    expect(rec.values[field("标题").id]).toBe("服务器剪藏的文章");
    expect(rec.values[field("原文链接").id]).toBe("https://mp.weixin.qq.com/s/abc123");
    expect(rec.values[field("作者").id]).toBe("张三");

    // 图片走代理下载进附件库；快照改写后也进附件库
    const assets = await db.assets.toArray();
    const image = assets.find((a) => a.kind === "clip");
    const snapshot = assets.find((a) => a.kind === "clip-snapshot");
    expect(image?.mime).toBe("image/png");
    expect(image?.size).toBe(4);
    expect(snapshot?.mime).toBe("text/html");
    expect(new TextDecoder().decode(new Uint8Array(snapshot!.data as ArrayBuffer))).toContain(
      "asset://"
    );

    // 落库的记录正文是 textToBlocks 的结果（本例纯文本，无图片引用）
    const stored = await db.records.get(rec.id);
    expect(JSON.stringify(stored?.doc ?? [])).toContain("第一段正文");
  });

  it("幂等：同一篇再跑一遍跳过，不会多出记录或多下图片", async () => {
    stubClipServer();
    await autoImportServerClips();
    const assetsBefore = (await db.assets.toArray()).length;

    const second = await autoImportServerClips();

    expect(second).toEqual({ checked: 1, imported: 0 });
    const lib = await clipLibrary();
    expect(lib!.records).toHaveLength(1);
    expect((await db.assets.toArray()).length).toBe(assetsBefore);
  });

  it("只有非 complete 条目时不建表也不导入", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            clips: [{ id: "clip-2", title: "x", source: "wechat_mp", savedAt: "", status: "partial" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const result = await autoImportServerClips();

    expect(result).toEqual({ checked: 0, imported: 0 });
    expect(useStore.getState().collections.find((c) => c.name === "剪藏库")).toBeUndefined();
  });

  it("服务器不可达：安静返回 0，不抛错", async () => {
    stubClipServer({ indexFail: true });

    const result = await autoImportServerClips();

    expect(result).toEqual({ checked: 0, imported: 0 });
    expect(useStore.getState().collections.find((c) => c.name === "剪藏库")).toBeUndefined();
  });
});

describe("未读/已读判定（I02）", () => {
  it("clipReadState：按字段名+选项名定位；缺字段或缺选项返回 null", () => {
    const collection = useStore.getState().collections.find((c) => c.name === "剪藏库");
    expect(collection).toBeUndefined(); // 本组用例没导入过，先确认干净
    const field = (name: string, options?: Array<{ id: string; name: string }>): FieldDef =>
      ({ id: "f-" + name, name, type: "select", options } as FieldDef);
    const table: CollectionRow = {
      id: "t1",
      name: "剪藏库",
      icon: null,
      fields: [
        field("标题"),
        field("状态", [
          { id: "opt-u", name: "未读" },
          { id: "opt-r", name: "已读" },
        ]),
      ],
      views: [],
      records: [],
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    } as unknown as CollectionRow;
    expect(clipReadState(table)).toEqual({ fieldId: "f-状态", unreadId: "opt-u", readId: "opt-r" });
    expect(clipReadState({ ...table, fields: [field("标题")] })).toBeNull();
    expect(clipReadState({ ...table, fields: [field("状态", [{ id: "o", name: "未读" }])] })).toBeNull();
    expect(clipReadState(undefined)).toBeNull();
  });

  it("isClipUnread / unreadClipCount：状态=未读才算未读", () => {
    const collection = {
      id: "t1",
      name: "剪藏库",
      fields: [
        { id: "f-状态", name: "状态", type: "select", options: [
          { id: "opt-u", name: "未读" },
          { id: "opt-r", name: "已读" },
        ] },
      ],
    } as unknown as CollectionRow;
    const rec = (status: string): RecordRow =>
      ({ id: "r1", collectionId: "t1", values: { "f-状态": status }, doc: null, snapshotAssetId: null }) as unknown as RecordRow;
    expect(isClipUnread(collection, rec("opt-u"))).toBe(true);
    expect(isClipUnread(collection, rec("opt-r"))).toBe(false);
    expect(isClipUnread(collection, rec(""))).toBe(false);
    expect(unreadClipCount(collection, [rec("opt-u"), rec("opt-r"), rec("opt-u")])).toBe(2);
    expect(unreadClipCount(collection, undefined)).toBe(0);
  });

  it("端到端：自动导入的记录默认未读，setCell 标已读后入库且不再算未读", async () => {
    stubClipServer();
    await autoImportServerClips();

    const store = useStore.getState();
    const collection = store.collections.find((c) => c.name === "剪藏库")!;
    const st = clipReadState(collection)!;
    expect(st).not.toBeNull();
    let records = useStore.getState().records[collection.id];
    expect(records).toHaveLength(1);
    expect(isClipUnread(collection, records[0])).toBe(true);

    store.setCell(collection.id, records[0].id, st.fieldId, st.readId);

    records = useStore.getState().records[collection.id];
    expect(isClipUnread(collection, records[0])).toBe(false);
    expect(records[0].values[st.fieldId]).toBe(st.readId);
    const stored = await db.records.get(records[0].id);
    expect(stored?.values[st.fieldId]).toBe(st.readId); // 落库了
    expect(unreadClipCount(collection, records)).toBe(0); // 侧栏角标归零
  });
});
