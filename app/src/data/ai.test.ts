import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildChatMessages,
  buildPageMessages,
  buildRewriteMessages,
  buildSelectionMessages,
  chat,
  chatEndpoint,
  DEFAULT_AI_CONFIG,
  type AiConfig,
} from "./ai";

const config: AiConfig = { ...DEFAULT_AI_CONFIG, apiKey: "sk-test", model: "m1" };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI 配置：端点拼接", () => {
  it("补 /chat/completions，去掉末尾斜杠", () => {
    expect(chatEndpoint("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/chat/completions");
    expect(chatEndpoint("http://127.0.0.1:4000/v1")).toBe("http://127.0.0.1:4000/v1/chat/completions");
  });

  it("已经写全的地址不重复拼", () => {
    expect(chatEndpoint("https://x/v1/chat/completions")).toBe("https://x/v1/chat/completions");
  });
});

describe("AI 提示词", () => {
  it("空正文不发请求", () => {
    expect(buildPageMessages("summary", "标题", "   ")).toBeNull();
    expect(buildRewriteMessages("  ", "")).toBeNull();
  });

  it("整页消息带标题和正文", () => {
    const messages = buildPageMessages("points", "项目计划", "第一段");
    expect(messages?.[0].role).toBe("system");
    expect(messages?.[1].content).toContain("项目计划");
    expect(messages?.[1].content).toContain("第一段");
  });

  it("改写带可选要求", () => {
    const messages = buildRewriteMessages("原文", "更口语");
    expect(messages?.[1].content).toContain("更口语");
    expect(messages?.[1].content).toContain("原文");
  });
});

describe("选区工具条动作", () => {
  it("改写 / 更简洁走改写提示词，简洁带要求", () => {
    const rewrite = buildSelectionMessages("rewrite", "原文");
    expect(rewrite?.[0].content).toContain("改写");
    const shorten = buildSelectionMessages("shorten", "原文");
    expect(shorten?.[1].content).toContain("更简洁");
  });

  it("翻译用独立的翻译提示词，只发选中文字", () => {
    const messages = buildSelectionMessages("translate", "这一段");
    expect(messages?.[0].content).toContain("翻译");
    expect(messages?.[1].content).toBe("这一段");
  });

  it("空选中不发请求", () => {
    expect(buildSelectionMessages("rewrite", "   ")).toBeNull();
  });
});

describe("AI 对话消息", () => {
  it("不带上下文时只有系统提示 + 历史", () => {
    const messages = buildChatMessages([{ role: "user", content: "你好" }], null);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toBe("你好");
  });

  it("带本页正文时把页面放进一条 system 消息", () => {
    const messages = buildChatMessages([{ role: "user", content: "总结一下" }], {
      title: "项目计划",
      text: "第一段",
    });
    expect(messages).toHaveLength(3);
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("项目计划");
    expect(messages[1].content).toContain("第一段");
  });

  it("长对话只带最近 20 条", () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      role: "user" as const,
      content: `第 ${i} 条`,
    }));
    const messages = buildChatMessages(history, null);
    expect(messages).toHaveLength(21);
    expect(messages[1].content).toBe("第 20 条");
  });
});

describe("AI 请求", () => {
  it("没填 Key 时不发请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await chat([], { ...config, apiKey: "" });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("成功时取 choices[0].message.content", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(200, { choices: [{ message: { content: "  摘要  " } }] }))
    );
    const result = await chat([{ role: "user", content: "x" }], config);
    expect(result).toEqual({ ok: true, text: "摘要" });
  });

  it("401 翻译成 Key 问题", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(jsonResponse(401, { error: { message: "invalid key" } }))
    );
    const result = await chat([{ role: "user", content: "x" }], config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("API Key");
      expect(result.error).toContain("invalid key");
    }
  });

  it("网络失败不抛异常", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
    const result = await chat([{ role: "user", content: "x" }], config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("连不上");
  });

  it("返回空内容时明确报错", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(jsonResponse(200, { choices: [] })));
    const result = await chat([{ role: "user", content: "x" }], config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("空内容");
  });
});
