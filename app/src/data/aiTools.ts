/**
 * 把 MCP 工具接进 OpenAI 兼容的 function calling。
 *
 * 流程：模型返回 tool_calls → 逐个调 MCP → 把结果作为 role=tool 回执 →
 * 再让模型基于工具结果回答。最多 3 轮，防止模型和工具互相踢皮球。
 */
import { chatApi, type AiConfig, type ApiMessage, type OpenAiTool } from "./ai";
import type { McpCallResult, McpTool } from "./mcp";

export type McpToolset = {
  openAiTools: OpenAiTool[];
  /** OpenAI 函数名 → MCP 工具（名字要符合 ^[a-zA-Z0-9_-]{1,64}$，所以用 mcp_0、mcp_1…） */
  byName: Map<string, McpTool>;
};

export function buildMcpToolset(tools: McpTool[]): McpToolset {
  const byName = new Map<string, McpTool>();
  const openAiTools: OpenAiTool[] = tools.map((tool, index) => {
    const name = `mcp_${index}`;
    byName.set(name, tool);
    return {
      type: "function",
      function: {
        name,
        description: `[${tool.serverName}] ${tool.description || tool.name}`,
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
      },
    };
  });
  return { openAiTools, byName };
}

export type ToolLoopResult =
  | { ok: true; text: string; used: string[] }
  | { ok: false; error: string };

export type ToolExecutor = (tool: McpTool, args: unknown) => Promise<McpCallResult>;

export async function chatWithTools(
  messages: ApiMessage[],
  config: AiConfig,
  toolset: McpToolset,
  execute: ToolExecutor,
  maxRounds = 3,
  /** 测试注入用；生产默认走真实请求 */
  chatFn: typeof chatApi = chatApi
): Promise<ToolLoopResult> {
  const used: string[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    const result = await chatFn(messages, config, toolset.openAiTools);
    if (!result.ok) return result;

    if (result.toolCalls.length === 0) {
      return { ok: true, text: result.content, used };
    }

    messages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      const tool = toolset.byName.get(call.function.name);
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `未知工具：${call.function.name}`,
        });
        continue;
      }

      let args: unknown;
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: "工具参数不是合法 JSON",
        });
        continue;
      }

      used.push(`${tool.serverName} / ${tool.name}`);
      const toolResult = await execute(tool, args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResult.ok ? toolResult.text : `工具调用失败：${toolResult.error}`,
      });
    }
  }

  return { ok: false, error: `工具调用超过 ${maxRounds} 轮，已停止` };
}
