// CloudBase 存储层自测：文档映射（Clip↔doc 往返无损）、四个操作的适配器语义（假适配器，不联网）
// 用法: node tests/cloudbase.selftest.ts
import type { Clip } from "../src/store/types.ts";
import {
  CLIPS_COLLECTION,
  CloudbaseStore,
  clipToDoc,
  docToClip,
} from "../src/store/cloudbaseStore.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const sample: Clip = {
  id: "wx_0123456789abcdef",
  source: "wechat_mp",
  sourceUrl: "http://mp.weixin.qq.com/s?__biz=abc",
  canonicalUrl: "https://mp.weixin.qq.com/s?__biz=abc",
  title: "测试文章",
  author: "阿汤",
  account: "科技汤",
  publishedAt: "2026-11-04T10:00:00.000Z",
  savedAt: "2026-11-05T02:37:41.086Z",
  text: "正文内容若干",
  assets: [
    { assetId: "19d9a135aaf1ed00", provider: "r2", ext: "html" },
    { assetId: "8c29d17154c7ae89", provider: "r2", ext: "png" },
  ],
  status: "complete",
  failReason: null,
  note: undefined,
};

// ---- 文档映射 ----
const doc = clipToDoc(sample);
check("id 映射为 _id", doc._id === sample.id);
check("assets 保持对象数组且只含编号（G1）", JSON.stringify(doc.assets).includes("assetId") && !JSON.stringify(doc.assets).includes("http"));
check("文档里没有完整图片 URL（G1 红线）", !JSON.stringify(doc).includes("mmbiz.qpic.cn"));

const roundTrip = docToClip(doc);
check(
  "Clip→doc→Clip 往返无损",
  JSON.stringify({ ...roundTrip, note: undefined }) === JSON.stringify({ ...sample, note: undefined })
);

// 缺字段文档不炸
const sparse = docToClip({ _id: "x" });
check("缺字段文档返回类型默认值", sparse.id === "x" && sparse.status === "failed" && Array.isArray(sparse.assets));

// ---- 四个操作（假适配器）----
interface Row {
  data: Record<string, unknown>;
}
class FakeAdapter {
  rows = new Map<string, Row>();
  async docSet(_c: string, id: string, data: Record<string, unknown>): Promise<void> {
    this.rows.set(id, { data });
  }
  async existsById(_c: string, id: string): Promise<boolean> {
    return this.rows.has(id);
  }
  async listAll(_c: string): Promise<Array<Record<string, unknown>>> {
    return [...this.rows.values()].map((r) => r.data);
  }
  async docGet(_c: string, id: string): Promise<Record<string, unknown> | null> {
    return this.rows.get(id)?.data ?? null;
  }
}

const adapter = new FakeAdapter();
const store = new CloudbaseStore(adapter as never, "clips");
check("集合名默认 clips", CLIPS_COLLECTION === "clips");

let savedOk = false;
try {
  await store.saveClip(sample);
  savedOk = adapter.rows.has(sample.id);
} catch (e) {
  console.error(String(e));
}
check("saveClip 幂等覆盖写入", savedOk);

check("existsClip 真", await store.existsClip(sample.id));
check("existsClip 假", !(await store.existsClip("wx_none")));

const got = await store.getClip(sample.id);
check("getClip 返回原记录", got?.title === "测试文章" && got?.assets.length === 2);
check("getClip 不存在返回 null", (await store.getClip("wx_none")) === null);

// saveClip 二次写同一 id：覆盖不新增
const v2 = { ...sample, text: "改过的正文" };
await store.saveClip(v2);
check("同 id 二次保存为覆盖（仍 1 条）", adapter.rows.size === 1);
check("覆盖后读到新值", (await store.getClip(sample.id))?.text === "改过的正文");

const list = await store.listClips();
check("listClips 返回全部", list.length === 1 && list[0]!.id === sample.id);

// 异步失败透传
class BoomAdapter extends FakeAdapter {
  async docSet(): Promise<void> {
    throw new Error("db down");
  }
}
const boom = new CloudbaseStore(new BoomAdapter() as never, "clips");
let boomMsg = "";
try {
  await boom.saveClip(sample);
} catch (e) {
  boomMsg = String((e as Error).message);
}
check("数据库异常透传给流水线", boomMsg === "db down");

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;