// 划线接口的 HTTP 自测（H02：按 URL 存取 + 幂等 + 鉴权 + 校验）
// 用法: node tests/highlights.selftest.ts
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const REL_DIR = path.join("out", "test-highlights");
const tmpDir = path.resolve(import.meta.dirname, "..", REL_DIR);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.env.KF_DATA_DIR = REL_DIR;
process.env.CLIP_TOKEN = "hl-test-token";

const { createClipServer } = await import("../src/clipServer.ts");
const { closeSyncDb } = await import("../src/cloud/syncStore.ts");

const server = createClipServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const auth = { "Content-Type": "application/json", Authorization: "Bearer hl-test-token" };

const PAGE = "https://mp.weixin.qq.com/s/demo-article";
const QUOTE1 = { exact: "被选中的一段原文", prefix: "它前面的引文", suffix: "它后面的引文" };

async function post(body: unknown, withToken = true): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}/api/highlights`, {
    method: "POST",
    headers: withToken ? auth : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function get(pageUrl: string, withToken = true): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}/api/highlights?pageUrl=${encodeURIComponent(pageUrl)}`, {
    headers: withToken ? auth : undefined,
  });
  return { status: res.status, json: await res.json() };
}

{
  const r = await post({ pageUrl: PAGE, title: "T", quote: QUOTE1 }, false);
  check("不带 Token 上报 → 401", r.status === 401, `${r.status} ${JSON.stringify(r.json)}`);
}
{
  const r = await get(PAGE, false);
  check("不带 Token 读取 → 401", r.status === 401, String(r.status));
}
{
  const r = await post({ pageUrl: PAGE, title: "演示文章", quote: QUOTE1 });
  check(
    "合法上报 → 200 且 created=true",
    r.status === 200 && r.json.ok === true && r.json.created === true,
    JSON.stringify(r.json)
  );
  check("返回 16 位十六进制 id", typeof r.json.id === "string" && /^[0-9a-f]{16}$/.test(r.json.id), String(r.json.id));
  check("回带完整划线记录", r.json.highlight?.quote?.exact === QUOTE1.exact, JSON.stringify(r.json.highlight));
}
{
  const r = await post({ pageUrl: PAGE, title: "演示文章", quote: QUOTE1 });
  check(
    "同一处重复上报 → 200 且 created=false（幂等）",
    r.status === 200 && r.json.ok === true && r.json.created === false,
    JSON.stringify(r.json)
  );
}
{
  const r = await post({ pageUrl: PAGE, title: "演示文章", quote: { exact: "第二处划线", prefix: "", suffix: "结尾" } });
  check("同页第二处划线 → created=true", r.status === 200 && r.json.created === true, JSON.stringify(r.json));
}
{
  const r = await get(PAGE);
  const items = r.json.items ?? [];
  check(
    "按 URL 取回 → 两条且按划线先后排序",
    r.status === 200 && items.length === 2 && items[0].quote.exact === QUOTE1.exact && items[1].quote.exact === "第二处划线",
    JSON.stringify(r.json)
  );
  check(
    "条目形状：id/pageUrl/title/quote/createdAt 齐全",
    items.every(
      (i: any) =>
        typeof i.id === "string" && i.pageUrl === PAGE && i.title === "演示文章" && typeof i.createdAt === "number"
    ),
    JSON.stringify(items[0])
  );
}
{
  const r = await get("https://example.com/other-page");
  check("其他页面 → 空清单（按 URL 隔离）", r.status === 200 && (r.json.items ?? []).length === 0, JSON.stringify(r.json));
}
{
  const res = await fetch(`${base}/api/highlights`, { headers: auth });
  check("GET 缺 pageUrl 参数 → 400", res.status === 400, String(res.status));
}
{
  const r = await post({ pageUrl: PAGE, title: "T", quote: { exact: "   " } });
  check("exact 全空白 → 400 missing_quote", r.status === 400 && r.json.code === "missing_quote", JSON.stringify(r.json));
}
{
  const r = await post({ pageUrl: PAGE, title: "T", quote: { exact: "字".repeat(2001) } });
  check("exact 超 2000 字 → 400 quote_too_long", r.status === 400 && r.json.code === "quote_too_long", String(r.json.code));
}
{
  const r = await post({ pageUrl: PAGE, title: "T", quote: { exact: "x", prefix: "前".repeat(65) } });
  check("prefix 超 64 字 → 400 quote_side_too_long", r.status === 400 && r.json.code === "quote_side_too_long", String(r.json.code));
}
{
  const r = await post({ pageUrl: PAGE, title: "T" });
  check("缺 quote → 400 missing_quote", r.status === 400 && r.json.code === "missing_quote", JSON.stringify(r.json));
}
{
  const r = await post({ quote: QUOTE1 });
  check("缺 pageUrl → 400 missing_page_url", r.status === 400 && r.json.code === "missing_page_url", JSON.stringify(r.json));
}
{
  const r = await post({ pageUrl: "https://ok.example/a", title: "长标题".repeat(200), quote: QUOTE1 });
  check(
    "超长 title 被截断入库而非拒绝",
    r.status === 200 && r.json.highlight.title.length === 300,
    JSON.stringify(r.json.highlight?.title?.length)
  );
}

server.close();
closeSyncDb();
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(failed === 0 ? "\n全部通过 ✅" : `\n失败 ${failed} 项 ❌`);
process.exit(failed === 0 ? 0 : 1);
