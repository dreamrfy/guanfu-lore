// 本地联调用的 mock OpenAI 兼容服务（不参与生产）
// 用法：node tests/fixtures/mock-ai.mjs
// 网页端 AI 供应商填：http://127.0.0.1:8899/v1 ，Key 随便填，模型随便填。
//
// 行为：
//  - 请求带 tools 时：用户消息 → 返回一次 tool_call（mcp_0，参数 city=北京）；
//    工具回执 → 返回最终回答。用来验证「MCP 工具调用」闭环。
//  - 其余请求按系统提示词返回固定的总结/提炼/改写/对话文本。
import http from "node:http";

function plainReply(system) {
  if (system.includes("冲突合并助手")) {
    // 冲突判定：假装两处改的不是同一处 → 客户端会自动合并
    return JSON.stringify({
      sameSpot: false,
      reason: "两处改的是不同段落，可以合并",
      merged: "",
    });
  }
  if (system.includes("阅读助手")) {
    return "这是一条 mock 摘要：文章讲的是信息过载时代如何保持写作的诚意。（mock）";
  }
  if (system.includes("会议纪要")) {
    return "结论：本页讨论了下阶段排期。\n- [ ] 周三前给出方案（待确认）\n- [ ] 周五联调（待确认）\n未决问题：验收口径还没定。";
  }
  if (system.includes("翻译")) return "This is a mock translation of the selected text.";
  if (system.includes("改写")) return "这是改写后的示例文字（mock）。";
  if (system.includes("个人知识库里的写作与阅读助手")) {
    return "这一页主要讲了三件事：做出一个顺手的产品、保持写作的诚意、别被信息量牵着走。（mock 对话）";
  }
  return "这是 mock 返回的示例内容。";
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        /* ignore */
      }
      const messages = parsed.messages || [];
      const system = messages[0]?.content || "";
      const last = messages[messages.length - 1] || {};
      const hasTools = Array.isArray(parsed.tools) && parsed.tools.length > 0;

      if (hasTools && last.role === "user") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: { name: "mcp_0", arguments: JSON.stringify({ city: "北京" }) },
                    },
                  ],
                },
              },
            ],
          })
        );
        return;
      }
      if (hasTools && last.role === "tool") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: { role: "assistant", content: `根据工具结果：${last.content}（mock 工具回答）` },
              },
            ],
          })
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: plainReply(system) } }],
        })
      );
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(8899, "127.0.0.1", () => console.log("mock ai on http://127.0.0.1:8899"));
