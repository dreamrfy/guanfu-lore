// 本地联调用的 mock MCP 服务器（Streamable HTTP / JSON-RPC）
// 仅用于验证网页端的「MCP」页与工具调用，不参与生产。
// 用法：node tests/fixtures/mock-mcp.mjs
// 然后在网页端添加服务器：http://127.0.0.1:8901/mcp
import http from "node:http";

const TOOLS = [
  {
    name: "get_weather",
    description: "查询城市天气",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string", description: "城市名" } },
      required: ["city"],
    },
  },
];

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, authorization, mcp-session-id, mcp-protocol-version"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    let msg = {};
    try {
      msg = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const send = (result, headers = {}) => {
      res.writeHead(200, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
    };
    if (msg.method === "initialize") {
      send(
        {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "mock-mcp", version: "0.0.1" },
        },
        { "Mcp-Session-Id": "mock-session" }
      );
      return;
    }
    if (msg.method === "notifications/initialized") {
      res.writeHead(202);
      res.end();
      return;
    }
    if (msg.method === "tools/list") {
      send({ tools: TOOLS });
      return;
    }
    if (msg.method === "tools/call") {
      const city = msg.params?.arguments?.city ?? "某地";
      send({ content: [{ type: "text", text: `${city}现在 18°C，晴（mock MCP）` }], isError: false });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "未知方法" } }));
  });
});

server.listen(8901, "127.0.0.1", () => console.log("mock mcp on http://127.0.0.1:8901/mcp"));
