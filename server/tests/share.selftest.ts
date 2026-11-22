// 公开分享接口自测（W111/W112：开关/链接/匿名只读页/附件白名单/撤销）
// 用法: node tests/share.selftest.ts
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const REL_DIR = path.join("out", "test-share");
const tmpDir = path.resolve(import.meta.dirname, "..", REL_DIR);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.env.KF_DATA_DIR = REL_DIR;
process.env.CLIP_TOKEN = "share-test-token";
process.env.KF_DISABLE_R2 = "1"; // 测试环境无 R2：附件走本地降级（如支持），不影响分享主链路

const { createClipServer } = await import("../src/clipServer.ts");
const { closeSyncDb } = await import("../src/cloud/syncStore.ts");

const server = createClipServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const headers = { "Content-Type": "application/json", Authorization: "Bearer share-test-token" };

const PAGE_ID = "pg-share-e2e";
const PAGE_TITLE = "公开分享走查页";

async function pushPage(): Promise<void> {
  const payload = {
    page: { id: PAGE_ID, parentId: null, title: PAGE_TITLE, icon: "📄", updatedAt: Date.now(), createdAt: Date.now() },
    blocks: [
      { id: "b1", type: "heading", props: { level: 1 }, content: "分享走查标题", children: [] },
      { id: "b2", type: "paragraph", content: [{ type: "text", text: "正文第一段，带", styles: {} }, { type: "text", text: "加粗", styles: { bold: true } }], children: [] },
      { id: "b3", type: "bulletListItem", content: "要点一", children: [] },
      { id: "b4", type: "bulletListItem", content: "要点二", children: [] },
      { id: "b5", type: "image", props: { url: "asset://abc123def456", caption: "截图" }, children: [] },
    ],
  };
  const res = await fetch(`${base}/api/sync/push`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      changes: [{ entity: "page", entityId: PAGE_ID, op: "upsert", payload, baseSeq: 0, actor: "selftest" }],
      since: 0,
    }),
  });
  check("同步推送测试页面 → 200", res.status === 200, `${res.status} ${await res.text()}`);
}

async function postShare(pageId: string, withToken = true): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}/api/share`, {
    method: "POST",
    headers: withToken ? headers : { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function getSharePage(url: string): Promise<{ status: number; headers: Headers; html: string }> {
  const res = await fetch(url);
  return { status: res.status, headers: res.headers, html: await res.text() };
}

await pushPage();

// —— 开关与链接（W111） ——
{
  const r = await postShare(PAGE_ID, false);
  check("不带 Token 开分享 → 401", r.status === 401, String(r.status));
}
{
  const r = await postShare(PAGE_ID);
  check("开分享 → 200 且返回 /s/ 链接", r.status === 200 && typeof r.json.url === "string" && r.json.url.includes("/s/"), JSON.stringify(r.json));
  check("首次创建 created=true", r.json.created === true, String(r.json.created));

  const r2 = await postShare(PAGE_ID);
  check("重复开启幂等（同一 token）", r2.json.url === r.json.url && r2.json.created === false, `${r2.json.url} vs ${r.json.url}`);

  const page = await getSharePage(r.json.url);
  check("匿名 GET 分享页 → 200", page.status === 200, String(page.status));
  check("响应带 noindex（X-Robots-Tag）", (page.headers.get("x-robots-tag") ?? "").includes("noindex"), String(page.headers.get("x-robots-tag")));
  check("HTML 内也有 noindex meta", page.html.includes('content="noindex'), "");
  check("分享页含标题", page.html.includes(PAGE_TITLE), PAGE_TITLE);
  check("分享页含正文与列表", page.html.includes("正文第一段") && page.html.includes("要点一"), "");
  check("图片指向本 token 的附件路由", page.html.includes("/a/abc123def456"), "");

  const bad = await getSharePage(`${base}/s/AAAAAAAAAAAAAAAAAAAA`);
  check("错误 token → 404 失效页", bad.status === 404 && bad.html.includes("链接已失效"), String(bad.status));
}

// —— 附件白名单（W112） ——
{
  const denied = await fetch(`${base}/s/AAAAAAAAAAAAAAAAAAAA/a/whatever`);
  check("无效 token 取附件 → 404", denied.status === 404, String(denied.status));

  // 有效 token 但附件不在本页正文里 → 拒绝（不依赖 R2，index 里根本没有）
  const share = await postShare(PAGE_ID);
  const url = new URL(share.json.url);
  const foreign = await fetch(`${base}${url.pathname}/a/foreign00000000000`);
  check("附件不在本页正文 → 404 拒绝", foreign.status === 404, String(foreign.status));
}

// —— 撤销与重建（W111） ——
{
  const open = await postShare(PAGE_ID);
  const tokenUrl: string = open.json.url;
  const del = await fetch(`${base}/api/share`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ pageId: PAGE_ID }),
  });
  const delJson = await del.json().catch(() => ({}));
  check("关闭分享 → 200 且 shared=false", del.status === 200 && delJson.shared === false, `${del.status} ${JSON.stringify(delJson)}`);
  const after = await getSharePage(tokenUrl);
  check("撤销后旧链接 → 404 失效页", after.status === 404 && after.html.includes("链接已失效"), String(after.status));

  const reopen = await postShare(PAGE_ID);
  check("重新开启生成新 token", reopen.json.created === true && reopen.json.url !== tokenUrl, `${reopen.json.url} vs ${tokenUrl}`);
  const fresh = await getSharePage(reopen.json.url);
  check("新链接可访问", fresh.status === 200, String(fresh.status));
}

// —— 状态查询（W113 面板刷新用） ——
{
  const res = await fetch(`${base}/api/share?pageId=${encodeURIComponent(PAGE_ID)}`, { headers });
  const json = await res.json();
  check("GET /api/share 返回 shared=true + url", res.status === 200 && json.shared === true && typeof json.url === "string", JSON.stringify(json));
  const res2 = await fetch(`${base}/api/share?pageId=pg-not-exist`, { headers });
  const json2 = await res2.json();
  check("未分享页面 → shared=false", res2.status === 200 && json2.shared === false, JSON.stringify(json2));
}

closeSyncDb();
server.close();
console.log(failed === 0 ? "\n全部通过 ✅" : `\n存在失败 ❌（${failed}）`);
process.exit(failed === 0 ? 0 : 1);