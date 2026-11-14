/**
 * MCP 客户端（Streamable HTTP）
 *
 * 为什么手写而不是引 SDK：浏览器里只需要 initialize / tools/list / tools/call
 * 三个请求，协议消息就是 JSON-RPC；手写能把超时、SSE、错误翻译控制得更直接。
 *
 * 边界：这是"浏览器直连 MCP 服务器"，所以服务器必须允许 CORS；
 * 只支持 HTTP/HTTPS 的 Streamable HTTP 端点，不支持 stdio（那需要桌面壳）。
 */
import { newId, repo } from "./db";

export type McpServerConfig = {
  id: string;
  name: string;
  /** Streamable HTTP 端点，例如 https://example.com/mcp */
  url: string;
  /** 可选 Bearer Token；只存本机 */
  token: string;
  enabled: boolean;
};

export type McpTool = {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: unknown;
};

export type McpCallResult = { ok: true; text: string; isError: boolean } | { ok: false; error: string };

const SERVERS_KEY = "mcpServers";
const PROTOCOL_VERSION = "2025-03-26";
const REQUEST_TIMEOUT_MS = 30_000;

export function makeMcpServer(partial: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: newId(),
    name: partial.name?.trim() || "MCP 服务器",
    url: partial.url?.trim() || "",
    token: partial.token?.trim() || "",
    enabled: partial.enabled ?? true,
  };
}

export async function listMcpServers(): Promise<McpServerConfig[]> {
  const raw = await repo.getMeta<McpServerConfig[]>(SERVERS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is McpServerConfig => !!s && typeof s === "object" && typeof s.id === "string" && typeof s.url === "string"
  );
}

export async function saveMcpServer(server: McpServerConfig): Promise<void> {
  const rest = (await listMcpServers()).filter((s) => s.id !== server.id);
  await repo.setMeta(SERVERS_KEY, [
    ...rest,
    { ...server, name: server.name.trim() || "MCP 服务器", url: server.url.trim() },
  ]);
}

export async function deleteMcpServer(id: string): Promise<void> {
  await repo.setMeta(
    SERVERS_KEY,
    (await listMcpServers()).filter((s) => s.id !== id)
  );
}

export function validateMcpUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "只支持 http / https 地址";
    if (!parsed.hostname) return "地址缺少主机名";
    return null;
  } catch {
    return "不是合法网址";
  }
}

/* ---------------- JSON-RPC / Streamable HTTP ---------------- */

type RpcResponse = {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
};

function headers(server: McpServerConfig, sessionId?: string | null, version?: string): Record<string, string> {
  const out: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (server.token.trim()) out.Authorization = `Bearer ${server.token.trim()}`;
  if (sessionId) out["Mcp-Session-Id"] = sessionId;
  if (version) out["MCP-Protocol-Version"] = version;
  return out;
}

/** 从 SSE 文本里找出 id 匹配的那条 JSON-RPC 响应 */
export function parseSseForId(text: string, id: number): RpcResponse | null {
  const events = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  for (const event of events) {
    try {
      const parsed = JSON.parse(event) as RpcResponse;
      if (parsed.id === id && (parsed.result !== undefined || parsed.error)) return parsed;
    } catch {
      /* 单条坏事件跳过 */
    }
  }
  return null;
}

async function readResponse(res: Response, id: number): Promise<RpcResponse> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    // 一次性读完：Streamable HTTP 的服务端对请求响应会关闭流；
    // 极少数保持长连接的实现会在超时后由外层 AbortController 收掉。
    const text = await res.text();
    const found = parseSseForId(text, id);
    if (!found) throw new Error("MCP 的 SSE 响应里没有对应消息");
    return found;
  }
  return (await res.json()) as RpcResponse;
}

async function rpc(
  server: McpServerConfig,
  body: Record<string, unknown>,
  sessionId?: string | null,
  version?: string
): Promise<RpcResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(server.url, {
      method: "POST",
      headers: headers(server, sessionId, version),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      throw new Error(`MCP 服务返回 HTTP ${res.status}${detail ? `：${detail}` : ""}`);
    }
    return await readResponse(res, Number(body.id ?? -1));
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 工具 ---------------- */

type ToolListResult = {
  tools?: Array<{ name?: string; description?: string; inputSchema?: unknown }>;
};

export async function listMcpTools(server: McpServerConfig): Promise<McpTool[]> {
  const { session, version } = await handshake(server);
  const res = await rpc(
    server,
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    session,
    version
  );
  if (res.error) throw new Error(res.error.message || "MCP tools/list 失败");
  const tools = (res.result as ToolListResult)?.tools ?? [];
  return tools
    .filter((t): t is { name: string; description?: string; inputSchema?: unknown } => typeof t.name === "string")
    .map((t) => ({
      serverId: server.id,
      serverName: server.name,
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    }));
}

type ToolCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

export async function callMcpTool(
  server: McpServerConfig,
  toolName: string,
  args: unknown
): Promise<McpCallResult> {
  try {
    const { session, version } = await handshake(server);
    const res = await rpc(
      server,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: toolName, arguments: args ?? {} },
      },
      session,
      version
    );
    if (res.error) return { ok: false, error: res.error.message || "MCP 工具调用失败" };
    const result = res.result as ToolCallResult;
    const text =
      result?.content
        ?.filter((c) => typeof c.text === "string")
        .map((c) => c.text)
        .join("\n") ?? "";
    return { ok: true, text: text || "（工具没有返回文本）", isError: !!result?.isError };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) };
  }
}

/**
 * 握手 + 记住服务端下发的会话 id。
 * 单独包一层是因为会话 id 在响应头里，`rpc` 只返回 body。
 */
async function handshake(server: McpServerConfig): Promise<{ session: string | null; version: string }> {
  const bad = validateMcpUrl(server.url);
  if (bad) throw new Error(bad);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const initRes = await fetch(server.url, {
      method: "POST",
      headers: headers(server),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "bijiapp", version: "0.0.1" },
        },
      }),
      signal: controller.signal,
    });
    if (!initRes.ok) throw new Error(`MCP 服务返回 HTTP ${initRes.status}`);
    const session = initRes.headers.get("mcp-session-id");
    const body = (await readResponse(initRes, 1)) as RpcResponse;
    if (body.error) throw new Error(body.error.message || "MCP 初始化失败");
    const version = (body.result as { protocolVersion?: string })?.protocolVersion ?? PROTOCOL_VERSION;

    // 标准要求初始化后发一条通知；失败不影响后续请求
    try {
      await fetch(server.url, {
        method: "POST",
        headers: headers(server, session, version),
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
    } catch {
      /* ignore */
    }

    return { session, version };
  } finally {
    clearTimeout(timer);
  }
}
