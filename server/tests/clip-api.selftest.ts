// 剪藏 HTTP 接口自测：不联网，用 mock 依赖验证「URL → 结果载荷」的契约
// 用法: node tests/clip-api.selftest.ts
import { handleClipRequest, validateClipUrl, clipIdOf, type ClipApiDeps } from "../src/clipApi.ts";
import { createMockDeps, MOCK_ARTICLE_URL } from "../src/pipeline/mock.ts";
import { canonicalWechatArticleUrl } from "../src/fetch/article.ts";
import type { AssetRef, Clip } from "../src/store/types.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

function depsFor(mock: ReturnType<typeof createMockDeps>): ClipApiDeps {
  return {
    pipeline: mock.deps,
    getClip: (id) => mock.store.get(id) ?? null,
    listClips: () => [...mock.store.values()],
    deleteClip: (id) => {
      mock.store.delete(id);
    },
    // mock 的下载器不落盘图片字节（只返回 assetRef），这里补一份假字节；
    // 真实实现由 images.ts 写盘，接口层读法完全一样。
    readAsset: (ref: AssetRef) =>
      mock.assets.get(ref.assetId + "." + ref.ext) ??
      (ref.ext === "png" ? Buffer.from("89504e470d0a1a0a", "hex") : null),
  };
}

// ---- 1. URL 校验 ----
{
  check("合法 https", validateClipUrl("https://mp.weixin.qq.com/s?__biz=x").ok === true);
  check("拒绝非字符串", validateClipUrl(42).ok === false);
  check("拒绝空串", validateClipUrl("   ").ok === false);
  check("拒绝 file 协议", validateClipUrl("file:///etc/passwd").ok === false);
  check("拒绝带账号密码", validateClipUrl("https://u:p@example.com/a").ok === false);
  check("拒绝超长", validateClipUrl("https://a.com/" + "x".repeat(3000)).ok === false);
}

// ---- 2. 完整成功：正文 + 图片 + 自包含快照 ----
{
  const mock = createMockDeps();
  const result = await handleClipRequest({ url: MOCK_ARTICLE_URL }, depsFor(mock));
  check("返回 ok", result.ok === true, JSON.stringify(result));
  if (result.ok) {
    check("标题来自 mock 文章", result.clip.title.length > 0 && result.clip.title !== "(无标题)", result.clip.title);
    check("正文 HTML 含 mock 文本", result.contentHtml.includes("Mock 正文"), result.contentHtml.slice(0, 120));
    check("图片随载荷返回", result.assets.length === 2, String(result.assets.length));
    check("图片 mime 正确", result.assets.every((a) => a.mime === "image/png"), JSON.stringify(result.assets.map((a) => a.mime)));
    check("快照图片已内联 data URL", !!result.snapshotHtml && result.snapshotHtml.includes("data:image/png;base64,"));
    check("快照不含外链图片", !!result.snapshotHtml && !result.snapshotHtml.includes('src="https://mmbiz'));
  }
}

// ---- 3. 重复剪藏：返回已有记录，不重复传输正文 ----
{
  const mock = createMockDeps();
  const deps = depsFor(mock);
  const first = await handleClipRequest({ url: MOCK_ARTICLE_URL }, deps);
  const second = await handleClipRequest({ url: MOCK_ARTICLE_URL }, deps);
  check("第一次 ok", first.ok === true);
  check("第二次也 ok（已有记录）", second.ok === true, JSON.stringify(second));
  if (first.ok && second.ok) {
    check("幂等：同一 id", first.clip.id === second.clip.id, first.clip.id + " vs " + second.clip.id);
    check("第二次不再重抓正文（contentHtml 为空）", second.contentHtml === "");
    check("第二次仍带回已有快照", second.snapshotHtml !== null);
  }
  check("库里只存 1 条", mock.store.size === 1, String(mock.store.size));
}

// ---- 4. 抓取失败：明确报错，不返回半个空记录 ----
{
  const mock = createMockDeps({ failFetch: new Error("风控拦截") });
  const result = await handleClipRequest({ url: MOCK_ARTICLE_URL }, depsFor(mock));
  check("失败时 ok=false", result.ok === false, JSON.stringify(result));
  if (!result.ok) check("错误信息非空", result.error.length > 0, result.error);
}

// ---- 5. 失败记录可以重试：先删旧失败记录，再重新抓 ----
{
  const mock = createMockDeps();
  const id = clipIdOf(canonicalWechatArticleUrl(MOCK_ARTICLE_URL).toString());
  const failed: Clip = {
    id,
    source: "wechat_mp",
    sourceUrl: MOCK_ARTICLE_URL,
    canonicalUrl: null,
    title: "旧失败",
    author: "",
    account: "",
    publishedAt: null,
    savedAt: "2026-11-01T00:00:00.000Z",
    text: "",
    assets: [],
    status: "failed",
    failReason: "content_missing",
    note: "旧错误",
  };
  mock.store.set(id, failed);

  const result = await handleClipRequest({ url: MOCK_ARTICLE_URL }, depsFor(mock));
  check("失败记录重试后成功", result.ok === true, JSON.stringify(result));
  if (result.ok) check("返回的是新抓到的标题", result.clip.title !== "旧失败", result.clip.title);
  check("旧失败记录已被替换为 complete", mock.store.get(id)?.status === "complete", mock.store.get(id)?.status);
}

// ---- 5. 客户端/扩展直接提交正文（任意网页剪藏）----
{
  const saved: Clip[] = [];
  const result = await handleClipRequest(
    {
      url: "https://example.com/post",
      title: "示例文章",
      html: '<article><p>正文<strong>重点</strong></p><script>alert(1)</script></article>',
    },
    {
      pipeline: createMockDeps().deps,
      saveClip: (clip) => {
        saved.push(clip);
      },
    }
  );
  check("提交 HTML → ok", result.ok === true, JSON.stringify(result));
  if (result.ok) {
    check("脚本被清洗掉", !String(result.contentHtml).includes("script"), String(result.contentHtml).slice(0, 120));
    check("正文抽成纯文本", result.clip.text.includes("重点"), result.clip.text.slice(0, 80));
    check("标题用客户端给的", result.clip.title === "示例文章", result.clip.title);
  }
  check("落库了一条", saved.length === 1 && saved[0]!.sourceUrl === "https://example.com/post", String(saved.length));
}

// ---- 6. 非法 URL 直接拒绝，不跑流水线 ----
{
  const mock = createMockDeps();
  const result = await handleClipRequest({ url: "not-a-url" }, depsFor(mock));
  check("非法 URL 返回 invalid_url", !result.ok && result.code === "invalid_url", JSON.stringify(result));
  check("未产生任何剪藏", mock.store.size === 0, String(mock.store.size));
}

console.log(failed === 0 ? "\n全部通过 ✅" : `\n失败 ${failed} 项 ❌`);
process.exit(failed === 0 ? 0 : 1);
