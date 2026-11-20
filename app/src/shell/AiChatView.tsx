import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  buildChatMessages,
  chatStream,
  loadAiConfig,
  type AiConfig,
  type ApiMessage,
  type ChatMessage,
} from "../data/ai";
import { newId, repo, type AiSessionRow } from "../data/db";
import { buildMcpToolset, chatWithTools } from "../data/aiTools";
import {
  callMcpTool,
  listMcpServers,
  listMcpTools,
  type McpServerConfig,
  type McpTool,
} from "../data/mcp";
import { useLang } from "../i18n";

/**
 * AI 对话视图（W94 从 AiPanel 对话栏抽出，面板与桌面主页共用）：
 * 流式回复 + 停止 + 会话落库（刷新不丢）+ 历史切换 + MCP 工具。
 * 页面上下文由宿主传入（title/text）；桌面主页传 null = 不带页面上下文。
 */
export type AiChatHandle = {
  /** 外部入口（主页大输入框）发一条消息并立即执行 */
  send: (text: string) => void;
  /** 预填输入框但不发送（选区「在 AI 面板继续问」走这里） */
  prefill: (text: string) => void;
  /** 开新会话（旧会话留在历史里） */
  newSession: () => void;
};

export const AiChatView = forwardRef<
  AiChatHandle,
  {
    pageId: string | null;
    pageTitle: string | null;
    pageText: string | null;
    /** 主页没有"本页正文"这回事，勾选项直接不渲染 */
    allowPageContext?: boolean;
    /** ⊕/🕐/» 工具行；主页用大输入框形态时可关 */
    showTools?: boolean;
    /** 历史视图开关钮（showTools=false 时也能单独要历史入口） */
    showHistoryToggle?: boolean;
    /** 空态提示语；默认「和 AI 讨论这一页…」 */
    emptyHint?: string;
    /** 消息数变化通知（主页用它切 空态大输入框 ↔ 对话 两种形态） */
    onCountChange?: (count: number) => void;
    /** 隐藏自带输入行（主页空态自绘大输入框，发送走 ref.send） */
    hideInput?: boolean;
    /** 面板的 MCP 页签会增删服务器，宿主把列表传下来保持同步 */
    mcpServers?: McpServerConfig[];
    /** 挂载时的初始输入（选区「在 AI 面板继续问」走拉取式预填：面板被配置表单覆盖导致
        本组件卸载重建时，ref 推送必丢，宿主把待预填文本作为 prop 传进来才接得住） */
    initialInput?: string | null;
    /** 侧栏形态的 » 收起面板钮；不传就不显示 */
    onCollapse?: () => void;
  }
>(function AiChatView(
  {
    pageId,
    pageTitle,
    pageText,
    allowPageContext = true,
    showTools = true,
    showHistoryToggle = true,
    emptyHint,
    onCountChange,
    hideInput,
    mcpServers = [],
    onCollapse,
    initialInput,
  },
  ref
) {
  const { t } = useLang();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState(initialInput ?? "");
  const [withPage, setWithPage] = useState(true);
  const [toolTrace, setToolTrace] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<AiSessionRow[]>([]);
  const [mcpTools, setMcpTools] = useState<Record<string, McpTool[]>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadAiConfig().then(setConfig);
  }, []);

  // 挂载/换页恢复最近会话（W91 语义：刷新、换页不丢对话）。空会话不回填，保持空态。
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [latest] = await repo.listAiSessions(pageId);
      if (!alive || !latest || latest.messages.length === 0) return;
      sessionIdRef.current = latest.id;
      setMessages(latest.messages);
    })();
    return () => {
      alive = false;
    };
  }, [pageId]);

  // 宿主的 MCP 列表变了才重新发现工具（缓存仍留在本组件内）
  const serversKey = mcpServers.map((s) => s.id).join(",");
  useEffect(() => {
    setMcpTools({});
  }, [serversKey]);

  useEffect(() => {
    onCountChange?.(messages.length);
  }, [messages.length, onCountChange]);

  // 流式增量随时把最新一条顶到底
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const persistSession = (msgs: ChatMessage[], title?: string) => {
    const id = sessionIdRef.current;
    if (!id) return;
    const row: AiSessionRow = {
      id,
      pageId: pageId,
      title: title ?? "对话",
      messages: msgs
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    void repo.putAiSession(row);
  };

  const startNewSession = () => {
    sessionIdRef.current = newId();
    setMessages([]);
    setToolTrace([]);
    setChatInput("");
    setError(null);
  };

  const openHistory = async () => {
    setSessions(await repo.listAiSessions());
    setShowHistory(true);
  };

  const openSession = (row: AiSessionRow) => {
    sessionIdRef.current = row.id;
    setMessages(row.messages);
    setToolTrace([]);
    setError(null);
    setShowHistory(false);
  };

  const stopChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const sendChat = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    // config 是挂载时的快照；用户后配的供应商要发送时补读，否则后配置的会话首条发不出（W94 实测踩中）
    let cfg = config;
    if (!cfg) {
      cfg = await loadAiConfig();
      if (!cfg) {
        setError("还没填 API Key：AI 面板 → 供应商设置");
        return;
      }
      setConfig(cfg);
    }
    if (!sessionIdRef.current) sessionIdRef.current = newId();
    const userMessage: ChatMessage = { role: "user", content: text };
    const next = [...messages, userMessage];
    setMessages(next);
    setChatInput("");
    setError(null);
    setToolTrace([]);
    setBusy(true);
    persistSession(next, text.slice(0, 24));

    const base = buildChatMessages(
      next,
      withPage && pageText != null ? { title: pageTitle ?? "", text: pageText } : null
    ) as ApiMessage[];

    // 收集启用的 MCP 工具；没缓存过的先发现。单个服务器失败不应拖垮对话。
    const enabled = mcpServers.filter((s) => s.enabled);
    const allTools: McpTool[] = [];
    for (const server of enabled) {
      const cached = mcpTools[server.id];
      if (cached) {
        allTools.push(...cached);
        continue;
      }
      try {
        const tools = await listMcpTools(server);
        setMcpTools((prev) => ({ ...prev, [server.id]: tools }));
        allTools.push(...tools);
      } catch {
        /* 跳过这个服务器 */
      }
    }

    let answer = "";
    if (allTools.length > 0) {
      // 带工具的回合仍走非流式（流式 + 工具聚合复杂度高）【暂定】
      const toolset = buildMcpToolset(allTools);
      const byId = new Map(enabled.map((s) => [s.id, s]));
      const result = await chatWithTools([...base], cfg, toolset, (tool, args) => {
        const server = byId.get(tool.serverId);
        return server
          ? callMcpTool(server, tool.name, args)
          : Promise.resolve({ ok: false as const, error: "这个 MCP 服务器已被移除" });
      });
      if (!result.ok) {
        setBusy(false);
        setError(result.error);
        return;
      }
      answer = result.text;
      setToolTrace(result.used);
    } else {
      // W91 流式：增量直接顶进最后一条 assistant 消息
      const controller = new AbortController();
      abortRef.current = controller;
      const result = await chatStream(base as ChatMessage[], cfg, {
        signal: controller.signal,
        onDelta: (full) => {
          setMessages((prev) => {
            const copy = [...prev];
            if (copy[copy.length - 1]?.role === "assistant")
              copy[copy.length - 1] = { role: "assistant", content: full };
            else copy.push({ role: "assistant", content: full });
            return copy;
          });
        },
      });
      abortRef.current = null;
      if (!result.ok) {
        setBusy(false);
        setError(result.error);
        return;
      }
      answer = result.text;
    }

    const done: ChatMessage[] = answer
      ? [...next, { role: "assistant", content: answer }]
      : next; // 用户点停止且一无所获 → 只留已有内容
    setMessages(done);
    persistSession(done, next[0]?.content.slice(0, 24));
    setBusy(false);
  };

  useImperativeHandle(ref, () => ({
    send: (text: string) => void sendChat(text),
    prefill: (text: string) => {
      setShowHistory(false);
      setChatInput(text);
    },
    newSession: () => startNewSession(),
  }));

  if (!config) return null;

  if (showHistory) {
    return (
      <>
        <div className="ai__history">
          <div className="ai__history-head">
            <button className="ai__tool" title="返回对话" onClick={() => setShowHistory(false)}>
              «
            </button>
            <span className="ai__history-title">历史记录</span>
          </div>
          {sessions.length === 0 ? (
            <div className="ai__history-empty">暂无历史记录</div>
          ) : (
            <div className="ai__history-list">
              {sessions.map((s) => (
                <button key={s.id} className="ai__history-item" onClick={() => openSession(s)}>
                  <span className="ai__history-item-title">{s.title}</span>
                  <span className="ai__history-item-time">
                    {new Date(s.updatedAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {showTools && (
        <div className="ai__tools">
          <button className="ai__tool" title="新对话" onClick={startNewSession}>
            ⊕
          </button>
          {showHistoryToggle && (
            <button className="ai__tool" title="历史记录" onClick={() => void openHistory()}>
              🕐
            </button>
          )}
          {onCollapse && (
            <button className="ai__tool" title="收起面板" onClick={onCollapse}>
              »
            </button>
          )}
        </div>
      )}
      <div className="ai__chat">
        {messages.length === 0 && (
          <div className="ai__hint">
            {emptyHint ?? "和 AI 讨论这一页。会话自动保存，换页、刷新都在。"}
          </div>
        )}
        {messages.map((message, i) => (
          <div key={i} className={`ai__msg ai__msg--${message.role}`}>
            {message.content}
          </div>
        ))}
        {toolTrace.length > 0 && (
          <div className="ai__trace">调用了工具：{toolTrace.join("、")}</div>
        )}
        {busy && <div className="ai__msg ai__msg--assistant">思考中…</div>}
        <div ref={chatEndRef} />
      </div>
      {allowPageContext && (
        <label className="ai__check">
          <input
            type="checkbox"
            checked={withPage}
            onChange={(e) => setWithPage(e.target.checked)}
          />
          带上本页正文
        </label>
      )}
      {!hideInput && (
        <div className="ai__row">
          <input
            className="clip-input"
            value={chatInput}
            placeholder={t("aiAskPlaceholder")}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendChat(chatInput);
              }
            }}
            disabled={busy}
          />
          {busy ? (
            <button className="btn btn--sm" onClick={stopChat} title="停止生成（已收到的文字保留）">
              停止
            </button>
          ) : (
            <button
              className="btn btn--sm"
              onClick={() => void sendChat(chatInput)}
              disabled={!chatInput.trim()}
            >
              发送
            </button>
          )}
        </div>
      )}
      {error && <div className="modal__error">{error}</div>}
    </>
  );
});
