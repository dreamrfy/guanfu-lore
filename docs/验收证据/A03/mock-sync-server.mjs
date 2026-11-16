/**
 * A03 模拟器冒烟用的本地同步服务端（契约复刻 server/src/clipServer.ts 四条语义）
 *
 * 为什么用本地 mock：模拟器无外网出口（A02 实测 ping 8.8.8.8 全丢包），
 * 真云鉴权已由 A02 的 hosts 劫持 + SSH 隧道验证过；A03 要验的是
 * Room 写库 + 游标/自回声/推送协议，本地 mock 能把「拉一条真页面」喂给客户端，
 * 且不受网络环境影响。A14 全流程再接真云。
 *
 * 用法：node mock-sync-server.mjs 8787
 */
import http from "node:http";

const PORT = Number(process.argv[2] ?? 8787);
const now = Date.now();

const PAGE_CHANGE = {
  seq: 1,
  entity: "page",
  entityId: "page-a03-smoke",
  op: "upsert",
  // 服务端 payload 是 JSON 串（与 clipServer 落库形态一致）
  payload: JSON.stringify({
    page: {
      id: "page-a03-smoke",
      parentId: null,
      title: "A03 同步冒烟页",
      icon: "🧪",
      coverAssetId: null,
      createdAt: now,
      updatedAt: now,
      // 故意不带 deletedAt：验证 upsert 不会被误塞软删时间
      sortKey: 1.5,
      tags: ["A03", "冒烟"],
    },
    blocks: [
      {
        id: "block-a03-smoke",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "来自本地契约服务端的同步冒烟数据", styles: {} }],
        children: [],
      },
    ],
  }),
  actor: "mock-seed",
  baseSeq: 0,
  createdAt: now,
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
  console.log(`[mock] ${status} ${res.req.method} ${res.req.url} -> ${body.slice(0, 120)}`);
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* 忽略坏 JSON */ }

    if (req.url === "/api/health") {
      sendJson(res, 200, { ok: true, mode: "a03-mock" });
      return;
    }

    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ") || auth === "Bearer ") {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    console.log(`[mock] auth=${auth.replace(/Bearer (.{4}).*/, "Bearer $1***")}`);

    if (req.method === "POST" && req.url === "/api/sync/pull") {
      const since = Number(body.since ?? 0);
      // since < 1 时返回种子页；之后返回空增量（游标推进验证）
      const changes = since < PAGE_CHANGE.seq ? [PAGE_CHANGE] : [];
      sendJson(res, 200, { ok: true, changes, nextSeq: PAGE_CHANGE.seq });
      return;
    }

    if (req.method === "POST" && req.url === "/api/sync/push") {
      const input = Array.isArray(body.changes) ? body.changes : [];
      const results = input.map((change, index) => ({
        entityId: change.entityId,
        // 约定：entityId 里带 conflict 的条目服务端判冲突，用来在设备上走通「冲突副本」分支
        status: String(change.entityId ?? "").includes("conflict") ? "conflict" : "applied",
        seq: PAGE_CHANGE.seq + 1 + index,
      }));
      console.log(`[mock] push body=${JSON.stringify(body).slice(0, 200)}`);
      sendJson(res, 200, { ok: true, results, nextSeq: PAGE_CHANGE.seq + input.length });
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock] listening on http://0.0.0.0:${PORT} (emulator uses http://10.0.2.2:${PORT})`);
});