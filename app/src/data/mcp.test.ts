import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callMcpTool,
  listMcpServers,
  listMcpTools,
  makeMcpServer,
  parseSseForId,
  saveMcpServer,
  deleteMcpServer,
  validateMcpUrl,
} from "./mcp";
import { repo } from "./db";

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

/** 按 JSON-RPC method 路由的假 MCP 服务 */
function fakeMcp() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? "{}")) as { id?: number; method?: string };
    if (body.method === "initialize") {
      return json(
        {
          jsonrpc: "2.0",
          id: 1,
          result: { protocolVersion: "2025-03-26", serverInfo: { name: "mock" } },
        },
        { "mcp-session-id": "s1" }
      );
    }
    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (body.method === "tools/list") {
      return json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "get_weather",
              description: "查天气",
              inputSchema: { type: "object", properties: { city: { type: "string" } } },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call") {
      return json({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: "北京 18°C" }], isError: false },
      });
    }
    return new Response("", { status: 404 });
  });
}

describe("MCP：配置", () => {
  it("增删改查", async () => {
    const server = makeMcpServer({ name: "本地", url: "http://127.0.0.1:8901/mcp" });
    await saveMcpServer(server);
    let list = await listMcpServers();
    expect(list).toHaveLength(1);
    await saveMcpServer({ ...server, name: "改名" });
    list = await listMcpServers();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("改名");
    await deleteMcpServer(server.id);
    expect(await listMcpServers()).toHaveLength(0);
  });

  it("只接受 http / https", () => {
    expect(validateMcpUrl("ftp://x")).not.toBeNull();
    expect(validateMcpUrl("不是网址")).not.toBeNull();
    expect(validateMcpUrl("https://example.com/mcp")).toBeNull();
  });
});

describe("MCP：SSE 解析", () => {
  it("挑出 id 匹配的响应，坏事件跳过", () => {
    const text = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"a":1}}',
      "",
      "event: message",
      "data: {坏 JSON",
      "",
      "event: message",
      'data: {"jsonrpc":"2.0","id":2,"result":{"b":2}}',
      "",
    ].join("\n");
    const found = parseSseForId(text, 2);
    expect((found?.result as { b: number }).b).toBe(2);
    expect(parseSseForId(text, 3)).toBeNull();
  });
});

describe("MCP：工具发现与调用", () => {
  it("握手后列出工具", async () => {
    const fn = fakeMcp();
    vi.stubGlobal("fetch", fn);
    const tools = await listMcpTools(makeMcpServer({ url: "http://127.0.0.1:8901/mcp" }));
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("get_weather");
    expect(tools[0].serverName).toBe("MCP 服务器");
  });

  it("调用工具返回文本", async () => {
    vi.stubGlobal("fetch", fakeMcp());
    const result = await callMcpTool(
      makeMcpServer({ url: "http://127.0.0.1:8901/mcp" }),
      "get_weather",
      { city: "北京" }
    );
    expect(result).toEqual({ ok: true, text: "北京 18°C", isError: false });
  });

  it("HTTP 失败返回可读错误，不抛异常", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("boom", { status: 500 }))
    );
    const result = await callMcpTool(makeMcpServer({ url: "https://x/mcp" }), "t", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("HTTP 500");
  });

  it("服务地址非法时不发请求", async () => {
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    const result = await callMcpTool(makeMcpServer({ url: "ftp://x" }), "t", {});
    expect(result.ok).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("MCP：清理测试数据", () => {
  it("meta 里不残留服务器", async () => {
    await repo.setMeta("mcpServers", []);
    expect(await listMcpServers()).toHaveLength(0);
  });
});
