import { beforeEach, describe, expect, it } from "vitest";
import {
  ASSET_SCHEME,
  releaseAssetUrls,
  resolveAssetRefs,
  unresolveAssetRefs,
  uploadAsset,
} from "./assets";
import { repo } from "./db";
import { useStore } from "./store";

const s = () => useStore.getState();

const makeFile = (text: string, name = "a.png", type = "image/png") =>
  new File([new TextEncoder().encode(text)], name, { type });

beforeEach(() => {
  releaseAssetUrls();
  useStore.setState({ ready: false, bootError: null, pages: [], trash: [], docs: {}, tabs: [], activeTabId: null });
});

describe("附件层", () => {
  it("上传后能在库里查到，并带正确的类型和大小", async () => {
    const { assetId, url } = await uploadAsset(makeFile("hello"), "page-1", "cover");
    expect(assetId).toBeTruthy();
    expect(url.startsWith("blob:")).toBe(true);

    const row = await repo.getAsset(assetId);
    expect(row?.mime).toBe("image/png");
    expect(row?.size).toBe(5);
    expect(row?.kind).toBe("cover");
    expect(row?.pageId).toBe("page-1");
  });

  it("同一个附件重复取地址会复用，不会每次都造新的", async () => {
    const { assetId, url } = await uploadAsset(makeFile("x"), null, "image");
    const again = await import("./assets").then((m) => m.assetUrl(assetId));
    expect(again).toBe(url);
  });

  it("文档里的 asset:// 能换成可显示地址，也能换回去（原样往返）", async () => {
    const { assetId, url } = await uploadAsset(makeFile("img"), "p", "image");
    const doc = [{ type: "image", props: { url: ASSET_SCHEME + assetId, caption: "配图" } }];

    const resolved = await resolveAssetRefs(doc);
    expect((resolved[0] as { props: { url: string } }).props.url).toBe(url);

    const back = unresolveAssetRefs(resolved);
    expect(back).toEqual(doc); // 存回库里的必须还是 asset://
  });

  it("附件丢了也不会把文档写坏（保留原样，能看出这里本来有张图）", async () => {
    const doc = [{ type: "image", props: { url: ASSET_SCHEME + "不存在的附件" } }];
    const resolved = await resolveAssetRefs(doc);
    expect((resolved[0] as { props: { url: string } }).props.url).toBe(ASSET_SCHEME + "不存在的附件");
  });

  it("删除附件后就取不到了", async () => {
    const { assetId } = await uploadAsset(makeFile("bye"), null, "file");
    await repo.deleteAsset(assetId);
    expect(await repo.getAsset(assetId)).toBeNull();
  });
});

describe("封面与正文写入的真实落盘", () => {
  it("设置封面会落库，清空也会落库", async () => {
    await s().hydrate();
    const pageId = s().pages[0].id;
    const { assetId } = await uploadAsset(makeFile("cover"), pageId, "cover");

    s().setCover(pageId, assetId);
    await new Promise((r) => setTimeout(r, 50));
    expect((await repo.listPages()).find((p) => p.id === pageId)?.coverAssetId).toBe(assetId);

    s().setCover(pageId, null);
    await new Promise((r) => setTimeout(r, 50));
    expect((await repo.listPages()).find((p) => p.id === pageId)?.coverAssetId).toBeNull();
  });

  it("正文里的图片地址写库时自动换回 asset://，读出来又换回可显示地址", async () => {
    await s().hydrate();
    const pageId = s().pages[0].id;
    void s().ensureDoc(pageId);
    const { assetId, url } = await uploadAsset(makeFile("pic"), pageId, "image");

    // 编辑器交上来的内容里是"可显示的 blob 地址"
    s().setBlocks(pageId, [{ type: "image", props: { url } }] as never);
    await new Promise((r) => setTimeout(r, 400));

    // 库里必须是 asset://，否则重开就成破图
    const stored = (await repo.getDoc(pageId)) as Array<{ props: { url: string } }>;
    expect(stored[0].props.url).toBe(ASSET_SCHEME + assetId);

    // 重新读出来给编辑器用，又能显示
    const resolved = await resolveAssetRefs(stored);
    expect((resolved[0] as { props: { url: string } }).props.url).toBe(url);
  });

  it("备份会把附件一起带走", async () => {
    await s().hydrate();
    const { assetId } = await uploadAsset(makeFile("backup-me"), s().pages[0].id, "cover");
    const snapshot = await repo.exportAll();
    expect(snapshot.assets.map((a) => a.id)).toContain(assetId);

    await repo.importAll({ pages: [], docs: [], meta: [], assets: snapshot.assets });
    expect(await repo.getAsset(assetId)).not.toBeNull();
  });
});
