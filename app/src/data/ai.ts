/**
 * AI 供应商（OpenAI 兼容协议）
 *
 * 为什么直接 fetch：LiteLLM 网关、DeepSeek、OpenAI、通义、Ollama 都提供
 * `/v1/chat/completions`，一个请求函数就能全覆盖；引入各家 SDK 反而把可选范围缩小。
 *
 * 安全：API Key 只存在本机 IndexedDB 的 meta 表里，不上传、不写日志。
 */
import { repo } from "./db";

export type AiConfig = {
  /** 例如 https://api.openai.com/v1 或 http://127.0.0.1:4000/v1（LiteLLM） */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const AI_KEY = "aiProvider";

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  temperature: 0.3,
};

export async function loadAiConfig(): Promise<AiConfig | null> {
  const raw = await repo.getMeta<Partial<AiConfig>>(AI_KEY);
  if (!raw || typeof raw !== "object" || !raw.baseUrl || !raw.apiKey || !raw.model) return null;
  return { ...DEFAULT_AI_CONFIG, ...raw };
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await repo.setMeta(AI_KEY, {
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    temperature: config.temperature,
  });
}

export async function clearAiConfig(): Promise<void> {
  await repo.setMeta(AI_KEY, null);
}

/** 把配置里的地址补成完整的 chat/completions 端点 */
export function chatEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function errorMessageOf(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;
  const err = obj.error;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  if (typeof obj.message === "string") return obj.message;
  return "";
}

export type ChatResult = { ok: true; text: string } | { ok: false; error: string };

/** OpenAI function calling 的工具声明 */
export type OpenAiTool = {
  type: "function";
  function: { name: string; description?: string; parameters: unknown };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** 带工具调用时消息形态会多两种：assistant.tool_calls 和 role=tool 的回执 */
export type ApiMessage =
  | ChatMessage
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ApiChatResult =
  | { ok: true; content: string; toolCalls: ToolCall[] }
  | { ok: false; error: string };

/**
 * 调一次 chat/completions，允许带工具。
 * 永远返回结果对象，不抛异常（界面好处理）。
 */
export async function chatApi(
  messages: ApiMessage[],
  config: AiConfig,
  tools?: OpenAiTool[]
): Promise<ApiChatResult> {
  if (!config.apiKey.trim()) return { ok: false, error: "还没填 API Key" };
  if (!config.model.trim()) return { ok: false, error: "还没填模型名" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch(chatEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e as Error)?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "AI 服务 90 秒没有响应，请稍后再试" : "连不上 AI 服务，请检查地址与网络",
    };
  }
  clearTimeout(timer);

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON，下面按状态码报错 */
  }

  if (!res.ok) {
    const detail = errorMessageOf(data);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "API Key 无效或没有权限" + (detail ? `：${detail}` : "") };
    }
    if (res.status === 404) {
      return { ok: false, error: "地址不对（OpenAI 兼容地址通常要写到 /v1）" + (detail ? `：${detail}` : "") };
    }
    if (res.status === 429) {
      return { ok: false, error: "被限流或额度不足，请稍后再试" + (detail ? `：${detail}` : "") };
    }
    return { ok: false, error: `AI 服务返回 ${res.status}${detail ? `：${detail}` : ""}` };
  }

  const message = (
    data as {
      choices?: Array<{
        message?: {
          content?: unknown;
          tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    }
  )?.choices?.[0]?.message;

  const content = typeof message?.content === "string" ? message.content : "";
  const toolCalls: ToolCall[] = Array.isArray(message?.tool_calls)
    ? message!.tool_calls
        .filter((c) => c && c.function && typeof c.function.name === "string")
        .map((c, i) => ({
          id: c.id ?? `call_${i}`,
          type: "function" as const,
          function: { name: c.function!.name!, arguments: c.function!.arguments ?? "{}" },
        }))
    : [];

  if (!content.trim() && toolCalls.length === 0) {
    return { ok: false, error: "AI 返回了空内容（检查模型名是否可用）" };
  }
  return { ok: true, content: content.trim(), toolCalls };
}

/** 不带工具的单轮调用（总结/改写/技能都用它） */
export async function chat(messages: ChatMessage[], config: AiConfig): Promise<ChatResult> {
  const result = await chatApi(messages, config);
  return result.ok ? { ok: true, text: result.content } : result;
}

/* ---------------- 流式对话（W91） ---------------- */

export type StreamHandlers = {
  /** 每收到一段增量文本回调一次（累计后的全文） */
  onDelta: (fullText: string) => void;
  /** 用户点「停止」或组件卸载时 abort */
  signal: AbortSignal;
};

/**
 * 流式聊天：OpenAI 兼容协议 `stream: true`（SSE，data: {...} 行）。
 * 返回累计全文；被 abort 时算「用户停止」而不是错误——已收到的文本保留。
 */
export async function chatStream(
  messages: ChatMessage[],
  config: AiConfig,
  handlers: StreamHandlers
): Promise<ChatResult> {
  if (!config.apiKey.trim()) return { ok: false, error: "还没填 API Key" };
  if (!config.model.trim()) return { ok: false, error: "还没填模型名" };

  let res: Response;
  try {
    res = await fetch(chatEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, messages, temperature: config.temperature, stream: true }),
      signal: handlers.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return aborted
      ? { ok: true, text: "" }
      : { ok: false, error: "连不上 AI 服务，请检查地址与网络" };
  }

  if (!res.ok || !res.body) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* 非 JSON，按状态码报错 */
    }
    const detail = errorMessageOf(data);
    if (res.status === 401 || res.status === 403) return { ok: false, error: "API Key 无效或没有权限" + (detail ? `：${detail}` : "") };
    if (res.status === 404) return { ok: false, error: "地址不对（OpenAI 兼容地址通常要写到 /v1）" + (detail ? `：${detail}` : "") };
    if (res.status === 429) return { ok: false, error: "被限流或额度不足，请稍后再试" };
    return { ok: false, error: `AI 服务返回 ${res.status}${detail ? `：${detail}` : ""}` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 事件以空行分隔；一行一条 data:
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const delta = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: unknown } }>;
          };
          const piece = delta.choices?.[0]?.delta?.content;
          if (typeof piece === "string" && piece) {
            full += piece;
            handlers.onDelta(full);
          }
        } catch {
          /* 非 JSON 行跳过（心跳/注释行） */
        }
      }
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return { ok: true, text: full };
    return { ok: false, error: `流式读取中断：${String((e as Error)?.message ?? e)}` };
  }

  if (!full.trim()) return { ok: false, error: "AI 返回了空内容（检查模型名是否可用）" };
  return { ok: true, text: full };
}

/* ---------------- 提示词 ---------------- */

export const AI_ACTIONS = {
  summary: {
    label: "总结本页",
    system: "你是个人知识库的阅读助手。用中文写一段 120 字以内的摘要，抓主要结论，不要客套话。",
  },
  points: {
    label: "提炼要点",
    system: "你是个人知识库的阅读助手。把内容提炼成 3-6 条中文要点，每条一行，以「- 」开头，不要展开解释。",
  },
  rewrite: {
    label: "改写选中",
    system:
      "你是中文写作助手。只输出改写后的文字，不要解释、不要加引号、不要复述要求；保留原意与关键信息。",
  },
} as const;

export type AiAction = keyof typeof AI_ACTIONS;

/* ---------------- 选区工具条上的快捷动作 ---------------- */

export type SelectionAction = "rewrite" | "shorten" | "translate";

export const SELECTION_ACTIONS: Record<
  SelectionAction,
  { label: string; instruction: string; system?: string }
> = {
  rewrite: { label: "改写得更好", instruction: "" },
  shorten: { label: "更简洁", instruction: "在不丢关键信息的前提下更简洁" },
  translate: {
    label: "译成英文",
    instruction: "",
    system:
      "你是专业中英翻译。只输出英文译文，保留段落结构、专有名词与数字；不要解释，不要加引号。",
  },
};

export function buildSelectionMessages(action: SelectionAction, text: string): ChatMessage[] | null {
  const body = text.trim();
  if (!body) return null;
  const config = SELECTION_ACTIONS[action];
  if (config.system) {
    return [
      { role: "system", content: config.system },
      { role: "user", content: body.slice(0, 8000) },
    ];
  }
  return buildRewriteMessages(body, config.instruction);
}

/** 构造整页操作的 messages（空正文直接返回 null，避免把空内容发给模型） */
export function buildPageMessages(
  action: Exclude<AiAction, "rewrite">,
  title: string,
  text: string
): ChatMessage[] | null {
  const body = text.trim();
  if (!body) return null;
  return [
    { role: "system", content: AI_ACTIONS[action].system },
    { role: "user", content: `标题：${title || "无标题"}\n\n正文：\n${body.slice(0, 12000)}` },
  ];
}

export const AI_CHAT_SYSTEM =
  "你是个人知识库里的写作与阅读助手。用中文回答，简洁直接；不确定就说不确定，不要编造。";

/**
 * 侧边对话的消息：系统提示 + 可选的当前页上下文 + 最近若干轮。
 * 上下文放在 system 里而不是混进用户问题，模型更容易分清"资料"和"问题"。
 */
export function buildChatMessages(
  history: ChatMessage[],
  context: { title: string; text: string } | null
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: AI_CHAT_SYSTEM }];
  if (context?.text.trim()) {
    messages.push({
      role: "system",
      content: `当前页面《${context.title || "无标题"}》的内容：\n${context.text.slice(0, 12000)}`,
    });
  }
  // 只带最近 20 条，避免长对话把上下文撑爆
  messages.push(...history.slice(-20));
  return messages;
}

export function buildRewriteMessages(text: string, instruction: string): ChatMessage[] | null {
  const body = text.trim();
  if (!body) return null;
  return [
    { role: "system", content: AI_ACTIONS.rewrite.system },
    {
      role: "user",
      content: instruction.trim()
        ? `要求：${instruction.trim()}\n\n原文：\n${body.slice(0, 6000)}`
        : `原文：\n${body.slice(0, 6000)}`,
    },
  ];
}
