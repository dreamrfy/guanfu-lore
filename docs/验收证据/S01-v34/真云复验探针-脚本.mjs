// S01-v34 真服务复验探针（服务器 out/ 下，不进仓库提交范围）：打 127.0.0.1:8787，实体前缀 s01probe-，跑完 delete 清理
// 用法: node s01-reverify.mjs --tokenfile <file> <base>
const argv = process.argv.slice(2);
let token, base;
if (argv[0] === "--tokenfile") {
  const fs = await import("node:fs");
  token = fs.readFileSync(argv[1], "utf8").trim();
  base = argv[2];
} else {
  [token, base] = argv;
}
let failed = 0;
function check(name, ok, detail = "") {
  console.log((ok ? "PASS " : "FAIL ") + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}
const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const pid = `s01probe-page-${Date.now()}`;
const aid = `s01probe-asset-${Date.now()}`;

{
  const res = await fetch(`${base}/api/sync/push`, { method: "POST", headers: auth,
    body: JSON.stringify({ changes: [{ entity: "page", entityId: pid, op: "upsert", payload: { title: "S01真云复验页" }, baseSeq: 0, actor: "s01probe" }] }) });
  const b = await res.json();
  check("push upsert → applied", res.status === 200 && b.results?.[0]?.status === "applied", JSON.stringify(b));
}
{
  const res = await fetch(`${base}/api/sync/pull`, { method: "POST", headers: auth, body: JSON.stringify({ sinceSeq: 0 }) });
  const b = await res.json();
  const hit = (b.changes || []).find(c => c.entityId === pid);
  check("pull 看到探针页", res.status === 200 && hit && hit.op === "upsert", JSON.stringify(b).slice(0, 300));
}
{
  const res = await fetch(`${base}/api/sync/row?entity=page&entityId=${encodeURIComponent(pid)}`, { headers: auth });
  const b = await res.json();
  check("row 读取探针页", res.status === 200 && b.ok && b.payload?.title === "S01真云复验页", JSON.stringify(b).slice(0, 200));
}
{
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const put = await fetch(`${base}/api/sync/assets?assetId=${aid}&ext=png`, { method: "POST", headers: auth, body: png });
  const pb = await put.json();
  check("assets POST 上传", put.status === 200 && pb.ok, JSON.stringify(pb));
  const get = await fetch(`${base}/api/sync/assets/${aid}`, { headers: auth });
  const buf = Buffer.from(await get.arrayBuffer());
  check("assets GET 回读字节一致", get.status === 200 && buf.equals(png), `len=${buf.length}`);
}
{
  const h = { pageUrl: `https://example.com/s01probe-${Date.now()}`, title: "S01探针", quote: { exact: "复验划线原文", prefix: "", suffix: "" } };
  const p1 = await fetch(`${base}/api/highlights`, { method: "POST", headers: auth, body: JSON.stringify(h) });
  const p1b = await p1.json();
  check("highlights POST", p1.status === 200 && p1b.ok, JSON.stringify(p1b));
  const p2 = await fetch(`${base}/api/highlights`, { method: "POST", headers: auth, body: JSON.stringify(h) });
  const p2b = await p2.json();
  check("highlights 幂等（同 id）", p2.status === 200 && p2b.id === p1b.id, JSON.stringify(p2b));
  const g = await fetch(`${base}/api/highlights?pageUrl=${encodeURIComponent(h.pageUrl)}`, { headers: auth });
  const gb = await g.json();
  check("highlights GET 回读", g.status === 200 && gb.items?.length === 1 && JSON.stringify(gb.items[0]).includes("复验划线原文"), JSON.stringify(gb).slice(0, 200));
}
{
  const row = await (await fetch(`${base}/api/sync/row?entity=page&entityId=${encodeURIComponent(pid)}`, { headers: auth })).json();
  const cur = Number(row.seq || 0);
  const res = await fetch(`${base}/api/sync/push`, { method: "POST", headers: auth,
    body: JSON.stringify({ changes: [{ entity: "page", entityId: pid, op: "delete", baseSeq: cur, actor: "s01probe" }] }) });
  const b = await res.json();
  check("清理：探针页 delete（baseSeq=当前 seq）", res.status === 200 && b.results?.[0]?.status === "applied", JSON.stringify(b));
  // 探针历史遗留冲突记录全部消费掉（keep-server = 丢弃探针副本）
  const cl = await (await fetch(`${base}/api/sync/conflicts`, { headers: auth })).json();
  for (const c of (cl.conflicts || [])) {
    if (String(c.entityId || "").startsWith("s01probe-")) {
      await fetch(`${base}/api/sync/conflicts/resolve`, { method: "POST", headers: auth,
        body: JSON.stringify({ id: c.id, action: "keep-server" }) });
    }
  }
}
console.log(failed === 0 ? "ALL PASS" : `FAILED: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
