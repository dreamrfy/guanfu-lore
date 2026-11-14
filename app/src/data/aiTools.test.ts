import { describe, expect, it, vi } from "vitest";
import type { ApiChatResult, ApiMessage, OpenAiTool } from "./ai";
import { buildMcpToolset, chatWithTools } from "./aiTools";
import type { McpCallResult, McpTool } from "./mcp";

const config = { baseUrl: "https://x/v1", apiKey: "k", model: "m", temperature: 0 };

const tool: McpTool = {
  serverId: "s1",
  serverName: "本地",
  name: "get_weather",
  description: "查天气",
  inputSchema: { type: "object", properties: { city: { type: "string" } } },
};

describe("MCP 工具 → OpenAI function", () => {
  it("生成合法函数名并保留映射", () => {
    const toolset = buildMcpToolset([tool, { ...tool, name: "second" }]);
    expect(toolset.openAiTools.map((t) => t.function.name)).toEqual(["mcp_0", "mcp_1"]);
    expect(toolset.byName.get("mcp_0")?.name).toBe("get_weather");
    expect(toolset.openAiTools[0].function.description).toContain("本地");
    expect(toolset.openAiTools[0].function.parameters).toEqual(tool.inputSchema);
  });
});

describe("工具调用循环", () => {
  it("模型要工具 → 执行 → 回执 → 再回答", async () => {
    const toolset = buildMcpToolset([tool]);
    const execute = vi.fn(
      async (_tool: McpTool, args: unknown): Promise<McpCallResult> => ({
        ok: true,
        text: `北京 18°C（参数 ${JSON.stringify(args)}）`,
        isError: false,
      })
    );

    const rounds: ApiMessage[][] = [];
    const chatFn = async (messages: ApiMessage[]): Promise<ApiChatResult> => {
      rounds.push(messages.map((m) => ({ ...m })) as ApiMessage[]);
      if (rounds.length === 1) {
        return {
          ok: true,
          content: "",
          toolCalls: [
            { id: "c1", type: "function", function: { name: "mcp_0", arguments: '{"city":"北京"}' } },
          ],
        };
      }
      return { ok: true, content: "北京现在 18°C。", toolCalls: [] };
    };

    const result = await chatWithTools(
      [{ role: "user", content: "北京天气" }],
      config,
      toolset,
      execute,
      3,
      chatFn
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("北京现在 18°C。");
      expect(result.used).toEqual(["本地 / get_weather"]);
    }
    expect(execute).toHaveBeenCalledWith(tool, { city: "北京" });
    // 第二轮请求里应带上 assistant.tool_calls 和 role=tool 的回执
    const second = rounds[1];
    expect(second.some((m) => m.role === "assistant" && "tool_calls" in m)).toBe(true);
    const toolMessage = second.find((m) => m.role === "tool");
    expect(toolMessage && "content" in toolMessage ? toolMessage.content : "").toContain("18°C");
  });

  it("未知工具名 / 坏参数 / 执行失败都作为工具回执，不让对话崩掉", async () => {
    const toolset = buildMcpToolset([tool]);
    let round = 0;
    const chatFn = async (messages: ApiMessage[]): Promise<ApiChatResult> => {
      round += 1;
      if (round === 1) {
        return {
          ok: true,
          content: "",
          toolCalls: [
            { id: "a", type: "function", function: { name: "mcp_99", arguments: "{}" } },
            { id: "b", type: "function", function: { name: "mcp_0", arguments: "{坏" } },
            { id: "c", type: "function", function: { name: "mcp_0", arguments: "{}" } },
          ],
        };
      }
      const toolMessages = messages.filter((m) => m.role === "tool") as Array<{ content: string }>;
      expect(toolMessages.map((m) => m.content).join("|")).toContain("未知工具");
      expect(toolMessages.map((m) => m.content).join("|")).toContain("不是合法 JSON");
      expect(toolMessages.map((m) => m.content).join("|")).toContain("工具调用失败");
      return { ok: true, content: "好的", toolCalls: [] };
    };

    const result = await chatWithTools(
      [{ role: "user", content: "x" }],
      config,
      toolset,
      async () => ({ ok: false, error: "网络断了" }),
      3,
      chatFn
    );
    expect(result).toMatchObject({ ok: true, text: "好的" });
  });

  it("超过轮次上限就停", async () => {
    const toolset = buildMcpToolset([tool]);
    const chatFn = async (): Promise<ApiChatResult> => ({
      ok: true,
      content: "",
      toolCalls: [{ id: "c", type: "function", function: { name: "mcp_0", arguments: "{}" } }],
    });
    const result = await chatWithTools(
      [{ role: "user", content: "x" }],
      config,
      toolset,
      async () => ({ ok: true, text: "ok", isError: false }),
      2,
      chatFn
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("2 轮");
  });
});
