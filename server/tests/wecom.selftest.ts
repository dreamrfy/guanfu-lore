// 微信客服客户端自测（P1-01 poll 链路，离线）
// 用假 transport 验证：token 缓存、消息结构解析、错误码映射、游标落盘。
// 不连接真实微信接口。
// 用法: node tests/wecom.selftest.ts
process.env.KF_DATA_DIR = "data-selftest-wecom";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log((ok ? "✅" : "❌") + " " + name + (ok || !detail ? "" : " —— " + detail));
  if (!ok) failed++;
}

const { WecomClient, WecomError, loadCursor, saveCursor, shouldStopPaging } = await import("../src/sources/wecomClient.ts");
const fs = await import("node:fs");
const path = await import("node:path");

/** server 根目录；清理用绝对路径（P2-03），从任何 cwd 运行都不残留 */
const SERVER_ROOT = path.dirname(import.meta.dirname);
const TEST_DATA_DIR = path.join(SERVER_ROOT, "data-selftest-wecom");

type Call = { method: string; url: string; body?: unknown };

function makeTransport(responses: Array<{ status?: number; text: string }>) {
  const calls: Call[] = [];
  let i = 0;
  return {
    calls,
    transport: {
      async request(method: string, url: string, body?: unknown) {
        calls.push({ method: method as Call["method"], url, body });
        const next = responses[Math.min(i, responses.length - 1)]!;
        i += 1;
        return { status: next.status ?? 200, text: next.text };
      },
    },
  };
}

// ---- token 获取与缓存 ----
{
  const { transport, calls } = makeTransport([
    { text: JSON.stringify({ errcode: 0, access_token: "TOKEN-1", expires_in: 7200 }) },
    { text: JSON.stringify({ errcode: 0, next_cursor: "C1", has_more: 0, msg_list: [{ msgid: "m1" }] }) },
    { text: JSON.stringify({ errcode: 0, next_cursor: "C2", has_more: 0, msg_list: [{ msgid: "m2" }] }) },
  ]);
  const client = new WecomClient({ corpId: "corp", appSecret: "secret", transport });
  const first = await client.syncMessages({ limit: 10 });
  const second = await client.syncMessages({ cursor: "C1", limit: 10 });

  check("第一次拿到消息", first.messages.length === 1 && first.nextCursor === "C1");
  check("第二次拿到消息", second.messages.length === 1 && second.nextCursor === "C2");
  const tokenCalls = calls.filter((c) => c.url.includes("/cgi-bin/gettoken"));
  check("token 只请求一次（缓存生效）", tokenCalls.length === 1, "calls=" + tokenCalls.length);
  check("token 请求带 corpId/appSecret", tokenCalls[0]!.url.includes("corpid=corp") && tokenCalls[0]!.url.includes("corpsecret=secret"));
  const syncCalls = calls.filter((c) => c.url.includes("/cgi-bin/kf/sync_msg"));
  check("sync_msg 用 POST", syncCalls.every((c) => c.method === "POST"));
  check("sync_msg 带 access_token", syncCalls[0]!.url.includes("access_token=TOKEN-1"));
  check("limit 传进请求体", (syncCalls[0]!.body as { limit?: number }).limit === 10);
}

// ---- 错误码 ----
{
  const { transport } = makeTransport([{ text: JSON.stringify({ errcode: 40013, errmsg: "invalid corpid" }) }]);
  const client = new WecomClient({ corpId: "corp", appSecret: "secret", transport });
  try {
    await client.accessToken();
    check("errcode 非 0 应抛错", false);
  } catch (e) {
    check("errcode 非 0 抛 WecomError", e instanceof WecomError && (e as InstanceType<typeof WecomError>).errcode === 40013, String(e));
  }
}

// ---- 非 JSON / HTTP 异常 ----
{
  const { transport } = makeTransport([{ text: "<html>502</html>" }]);
  const client = new WecomClient({ corpId: "corp", appSecret: "secret", transport });
  try {
    await client.accessToken();
    check("非 JSON 应抛错", false);
  } catch (e) {
    check("非 JSON 抛出明确错误", /非 JSON/.test(String((e as Error).message)), String(e));
  }
}
{
  const { transport } = makeTransport([{ status: 500, text: "err" }]);
  const client = new WecomClient({ corpId: "corp", appSecret: "secret", transport });
  try {
    await client.accessToken();
    check("HTTP 500 应抛错", false);
  } catch (e) {
    check("HTTP 500 抛出明确错误", /HTTP 500/.test(String((e as Error).message)), String(e));
  }
}

// ---- 凭证缺失 ----
{
  try {
    new WecomClient({ corpId: "", appSecret: "" });
    check("凭证缺失应拒绝构造", false);
  } catch (e) {
    check("凭证缺失抛错", /凭证不完整/.test(String((e as Error).message)), String(e));
  }
}

// ---- N-08：多页 cursor / token 必须成对传递 ----
{
  const { transport, calls } = makeTransport([
    { text: JSON.stringify({ errcode: 0, access_token: "T", expires_in: 7200 }) },
    { text: JSON.stringify({ errcode: 0, next_cursor: "C1", token: "TOK1", has_more: 1, msg_list: [{ msgid: "m1" }] }) },
    { text: JSON.stringify({ errcode: 0, next_cursor: "C2", token: "TOK2", has_more: 0, msg_list: [{ msgid: "m2" }] }) },
  ]);
  const client = new WecomClient({ corpId: "corp", appSecret: "secret", transport });
  const page1 = await client.syncMessages({ cursor: "C0", token: "TOK0", limit: 20 });
  check("第 1 页返回 nextToken", page1.nextToken === "TOK1", page1.nextToken);
  check("第 1 页 hasMore", page1.hasMore === true);
  const page2 = await client.syncMessages({ cursor: page1.nextCursor, token: page1.nextToken, limit: 20 });

  const syncCalls = calls.filter((c) => c.url.includes("/cgi-bin/kf/sync_msg"));
  const b1 = syncCalls[0]!.body as { cursor?: string; token?: string };
  const b2 = syncCalls[1]!.body as { cursor?: string; token?: string };
  check("第 1 页请求体带初始 cursor/token", b1.cursor === "C0" && b1.token === "TOK0", JSON.stringify(b1));
  check("第 2 页请求体带上一页的 cursor/token", b2.cursor === "C1" && b2.token === "TOK1", JSON.stringify(b2));
  check("第 2 页 nextToken 与第 1 页成对传递", page2.nextToken === "TOK2", page2.nextToken);
  check("has_more=0 时不要求停止", !shouldStopPaging(page2));
}

// ---- N-08：has_more=1 但 next_cursor 为空 → 必须停止翻页 ----
{
  check(
    "has_more=1 且 next_cursor 空 → 停止",
    shouldStopPaging({ messages: [], nextCursor: "", nextToken: "", hasMore: true })
  );
  check(
    "has_more=0 且 next_cursor 空 → 正常结束",
    !shouldStopPaging({ messages: [], nextCursor: "", nextToken: "", hasMore: false })
  );
  check(
    "has_more=1 且有 next_cursor → 继续",
    !shouldStopPaging({ messages: [], nextCursor: "C", nextToken: "", hasMore: true })
  );
}

// ---- N-09：短 TTL 不得缓存超过真实过期时间 ----
{
  const { transport, calls } = makeTransport([
    { text: JSON.stringify({ errcode: 0, access_token: "SHORT-1", expires_in: 0 }) },
    { text: JSON.stringify({ errcode: 0, access_token: "SHORT-2", expires_in: 0 }) },
  ]);
  const client = new WecomClient({ corpId: "corp", appSecret: "secret", transport });
  const first = await client.accessToken();
  const second = await client.accessToken();
  const tokenCalls = calls.filter((c) => c.url.includes("/cgi-bin/gettoken"));
  check("expires_in=0 时立即过期并重新获取", first === "SHORT-1" && second === "SHORT-2", first + "/" + second);
  check("短 TTL 下 gettoken 被调用 2 次", tokenCalls.length === 2, "calls=" + tokenCalls.length);
}

{
  // 正常 TTL 仍需缓存（不能被上面的修复改成每次都取）
  const { transport, calls } = makeTransport([
    { text: JSON.stringify({ errcode: 0, access_token: "LONG-1", expires_in: 7200 }) },
    { text: JSON.stringify({ errcode: 0, next_cursor: "C", has_more: 0, msg_list: [] }) },
    { text: JSON.stringify({ errcode: 0, next_cursor: "C", has_more: 0, msg_list: [] }) },
  ]);
  const client = new WecomClient({ corpId: "corp", appSecret: "secret", transport });
  await client.syncMessages({ limit: 10 });
  await client.syncMessages({ cursor: "C", limit: 10 });
  const tokenCalls = calls.filter((c) => c.url.includes("/cgi-bin/gettoken"));
  check("正常 TTL 下 token 仍缓存（1 次）", tokenCalls.length === 1, "calls=" + tokenCalls.length);
}

// ---- 游标落盘 ----
{
  const cursor = { cursor: "C-ROUNDTRIP", token: "T", updatedAt: new Date().toISOString() };
  saveCursor(cursor);
  const loaded = loadCursor();
  check("游标可写可读", loaded?.cursor === "C-ROUNDTRIP", JSON.stringify(loaded));

  const cursorFile = path.join(TEST_DATA_DIR, "kf-cursor.json");
  check("游标文件已落盘", fs.existsSync(cursorFile), cursorFile);

  // 损坏的游标不应抛异常（最坏是重复拉取，幂等会去重）
  fs.writeFileSync(cursorFile, "{ 损坏", "utf8");
  check("损坏游标返回 null", loadCursor() === null);

  // 非法游标值必须拒绝写入（防异常数据落盘；写入路径本身是常量）
  fs.writeFileSync(cursorFile, JSON.stringify({ cursor: "../../etc/passwd", token: "", updatedAt: "" }), "utf8");
  check("非法游标读回时被清空", loadCursor()?.cursor === "");
  let rejected = false;
  try {
    saveCursor({ cursor: "../../etc/passwd", token: "", updatedAt: new Date().toISOString() });
  } catch {
    rejected = true;
  }
  check("非法游标值写入被拒绝", rejected);
  check("游标文件仍在固定路径（未被穿越）", fs.existsSync(cursorFile));

  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}

console.log(failed === 0 ? "\n自测全部通过" : `\n自测失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
