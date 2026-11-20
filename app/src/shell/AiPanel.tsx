import { useEffect, useRef, useState } from "react";
import {
  AI_ACTIONS,
  buildPageMessages,
  buildRewriteMessages,
  chat,
  DEFAULT_AI_CONFIG,
  loadAiConfig,
  saveAiConfig,
  type AiAction,
  type AiConfig,
} from "../data/ai";
import {
  deleteMcpServer,
  listMcpServers,
  listMcpTools,
  makeMcpServer,
  saveMcpServer,
  validateMcpUrl,
  type McpServerConfig,
  type McpTool,
} from "../data/mcp";
import { AiChatView, type AiChatHandle } from "./AiChatView";
import {
  addPresetSkills,
  buildSkillMessages,
  deleteSkill,
  listSkills,
  makeSkill,
  saveSkill,
  type AiSkill,
} from "../data/aiSkills";
import { extractBlocksText } from "../data/search";
import { useActiveDoc, useActivePage, useStore } from "../data/store";
import { useLang } from "../i18n";
import { askKnowledgeBase } from "../data/rag";
import type { Citation } from "../data/ragAsk";
import {
  DEFAULT_EMBED_CONFIG,
  loadEmbedConfig,
  saveEmbedConfig,
  type EmbedConfig,
} from "../data/ragEmbed";
import { setPendingBlockFocus } from "../data/search";
import { getCurrentEditor } from "../editor/editorRef";

type Tab = "actions" | "chat" | "skills" | "mcp" | "ask";

type Output = {
  /** 这次结果来自哪个动作 */
  label: string;
  text: string;
  /** 选区类结果：允许"替换选中" */
  selection?: string;
  /** 整段替换的结果（斜杠「AI 改写本段」）：替换的是这个块 */
  blockId?: string;
};

/**
 * 右侧 AI 面板：操作 / 对话 / 技能 / MCP 四栏 + 供应商配置。
 *
 * 统一原则：请求中显示具体动作，失败显示服务端原话，结果先预览，
 * 写进正文必须由用户再点一次（不会自动改稿）。
 */
export function AiPanel({
  context,
  contextKey,
  initialTab,
  hideTabs,
}: {
  /** 记录页等场景可以直接传上下文；不传就用当前打开的页面 */
  context?: { title: string; text: string };
  contextKey?: string;
  /** 打开时默认停在哪一栏（全局对话用 "chat"） */
  initialTab?: Tab;
  /** 隐藏三栏切换（全局对话只用一个栏） */
  hideTabs?: boolean;
} = {}) {
  const page = useActivePage();
  const doc = useActiveDoc();
  const { t } = useLang();
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [draft, setDraft] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [tab, setTab] = useState<Tab>(initialTab ?? "actions");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<Output | null>(null);

  const [skills, setSkills] = useState<AiSkill[]>([]);
  const [skillEditor, setSkillEditor] = useState<AiSkill | null>(null);

  /** W94：对话栏抽成 AiChatView（与桌面主页共用），对话状态/流式/落库/历史都在那里 */
  const chatRef = useRef<AiChatHandle | null>(null);
  /** W93 选区转面板的待预填文本：拉取式消费（配置表单覆盖 chat tab 导致卸载重建也不丢） */
  const [pendingPrefill, setPendingPrefill] = useState<string | null>(null);

  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpEditor, setMcpEditor] = useState<McpServerConfig | null>(null);
  const [mcpTools, setMcpTools] = useState<Record<string, McpTool[]>>({});
  const [mcpBusy, setMcpBusy] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);

  // 问知识库
  const [askInput, setAskInput] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askStrict, setAskStrict] = useState(true);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askCitations, setAskCitations] = useState<Citation[]>([]);
  const [askError, setAskError] = useState<string | null>(null);
  const [embed, setEmbed] = useState<EmbedConfig>(DEFAULT_EMBED_CONFIG);
  const [showEmbed, setShowEmbed] = useState(false);

  useEffect(() => {
    void loadEmbedConfig().then((cfg) => {
      setEmbed(cfg);
      if (cfg.apiKey) setShowEmbed(true);
    });
  }, []);

  // 斜杠菜单等入口发来的 AI 命令（面板关着时 dispatch 会顺手把面板打开）
  const command = useStore((s) => s.aiCommand);
  const clearCommand = useStore((s) => s.clearAiCommand);
  /** W92：侧栏形态下的 » 收起面板（顶栏模态有自己的关闭钮，不显示） */
  const toggleAiPanel = useStore((s) => s.toggleAiPanel);

  useEffect(() => {
    void loadAiConfig().then((cfg) => {
      setConfig(cfg);
      if (cfg) setDraft(cfg);
      else setEditingConfig(true);
    });
  }, []);

  useEffect(() => {
    void listSkills().then(setSkills);
  }, []);

  useEffect(() => {
    void listMcpServers().then(setMcpServers);
  }, []);

  /** 发现并缓存一个服务器的工具 */
  const refreshMcpTools = async (server: McpServerConfig) => {
    setMcpBusy(server.id);
    setMcpError(null);
    try {
      const tools = await listMcpTools(server);
      setMcpTools((prev) => ({ ...prev, [server.id]: tools }));
    } catch (e) {
      setMcpError(`「${server.name}」连接失败：${String((e as Error)?.message ?? e)}`);
    } finally {
      setMcpBusy(null);
    }
  };

  // 换页/换上下文：清掉上一个页面留下的动作结果（对话会话由 AiChatView 按页自载，W91 语义不变）
  useEffect(() => {
    setOutput(null);
    setError(null);
  }, [contextKey ?? page?.id]);

  const pageText = context
    ? context.text
    : doc
      ? extractBlocksText(doc as unknown[])
          .map((b) => b.text)
          .join("\n")
      : "";
  const pageTitle = context ? context.title : (page?.title ?? "");

  const selectedText = () => getCurrentEditor()?.getSelectedText()?.trim() ?? "";

  /** 改写一段文字：可以是当前选区，也可以是斜杠命令指定的某个块 */
  const runRewrite = async (text: string, blockId?: string) => {
    if (!config) return;
    const messages = buildRewriteMessages(text, instruction);
    if (!messages) return;
    setBusy("rewrite");
    const result = await chat(messages, config);
    setBusy(null);
    if (!result.ok) setError(result.error);
    else
      setOutput({
        label: blockId ? t("aiRewrite") : AI_ACTIONS.rewrite.label,
        text: result.text,
        selection: blockId ? undefined : text,
        blockId,
      });
  };

  const runAction = async (action: AiAction) => {
    if (!config) return;
    setError(null);
    setOutput(null);

    if (action === "rewrite") {
      const selected = selectedText();
      if (!selected) {
        setError("先在正文里选中一段文字，再点「改写选中」");
        return;
      }
      await runRewrite(selected);
      return;
    }

    const messages = buildPageMessages(action, pageTitle, pageText);
    if (!messages) {
      setError("这页还没有正文，先写点东西");
      return;
    }
    setBusy(action);
    const result = await chat(messages, config);
    setBusy(null);
    if (!result.ok) setError(result.error);
    else setOutput({ label: AI_ACTIONS[action].label, text: result.text });
  };

  // 斜杠菜单等入口发来的命令：取到就跑一次，然后清空（命令只消费一次）
  useEffect(() => {
    if (!command) return;
    if (command.kind === "summary" || command.kind === "points") {
      setTab("actions");
      void runAction(command.kind);
    } else if (command.kind === "rewriteBlock") {
      setTab("actions");
      void runRewrite(command.text ?? "", command.blockId);
    } else if (command.kind === "askPage") {
      // 搜索浮层里的「问问 AI「关键词」」/「在当前页中问 AI」
      setTab("ask");
      const q = command.question ?? "";
      if (q) setAskInput(q);
      void runAsk(q);
    } else if (command.kind === "selection") {
      // W93：选中文字弹层「在 AI 面板继续问」——选中原文预填进对话输入，发送即带上下文
      // 不用 chatRef.prefill 推送：未配置供应商时配置表单会覆盖 chat tab，AiChatView
      // 卸载重建后一次性推送必丢——改成 pendingPrefill 状态拉取，挂载时消费
      setTab("chat");
      const sel = (command.text ?? "").trim();
      if (sel) setPendingPrefill(`关于这段文字：「${sel}」`);
    }
    clearCommand();
  }, [command]);

  // pendingPrefill 已被 AiChatView 挂载消费（initialInput 只在 useState 初始化读一次），
  // 清掉避免之后切页签重挂载时重复带上旧选区文本
  useEffect(() => {
    if (pendingPrefill && chatRef.current) setPendingPrefill(null);
  }, [pendingPrefill, tab, editingConfig]);

  const runSkill = async (skill: AiSkill) => {
    if (!config) return;
    setError(null);
    setOutput(null);
    const selection = skill.scope === "selection" ? selectedText() : undefined;
    const messages = buildSkillMessages(skill, {
      title: pageTitle,
      pageText,
      selection,
    });
    if (!messages) {
      setError(
        skill.scope === "selection"
          ? "这个技能作用于选中文字，先在正文里选一段"
          : "这页还没有正文，先写点东西"
      );
      return;
    }
    setBusy(`skill:${skill.id}`);
    const result = await chat(messages, config);
    setBusy(null);
    if (!result.ok) setError(result.error);
    else setOutput({ label: skill.name, text: result.text, selection });
  };

  const insertAsCallout = (text: string) => {
    const editor = getCurrentEditor();
    if (!editor) {
      setError("编辑器还没就绪");
      return;
    }
    const last = editor.document[editor.document.length - 1];
    if (!last) return;
    editor.insertBlocks(
      [{ type: "callout", props: { emoji: "🤖", color: "blue" }, content: text } as never],
      last,
      "after"
    );
  };

  const replaceSelection = (text: string) => {
    const editor = getCurrentEditor();
    if (!editor) {
      setError("编辑器还没就绪");
      return;
    }
    editor.insertInlineContent(text, { updateSelection: true });
  };

  /** 整段替换：斜杠「AI 改写本段」的结果写回那个块 */
  const replaceBlock = (blockId: string, text: string) => {
    const editor = getCurrentEditor();
    if (!editor) {
      setError("编辑器还没就绪");
      return;
    }
    editor.updateBlock(blockId, { content: [{ type: "text", text }] } as never);
  };

  /* ---------------- 供应商配置 ---------------- */

  /** 问知识库 */
  const runAsk = async (override?: string) => {
    const question = (override ?? askInput).trim();
    if (!question || askBusy) return;
    setAskBusy(true);
    setAskError(null);
    setAskAnswer(null);
    setAskCitations([]);
    const result = await askKnowledgeBase(question, askStrict);
    setAskBusy(false);
    if (!result.ok) {
      setAskError(result.error ?? "问答失败");
      return;
    }
    setAskAnswer(result.answer ?? "");
    setAskCitations(result.citations ?? []);
  };

  /** 点了出处 → 跳到原文那一段 */
  const openCitation = async (citation: Citation) => {
    const state = useStore.getState();
    if (citation.entity === "page") {
      state.openTab(citation.entityId);
    } else {
      const entry = Object.entries(state.records).find(([, list]) =>
        list.some((record) => record.id === citation.entityId)
      );
      if (entry) {
        await state.openCollection(entry[0]);
        state.openRecord(entry[0], citation.entityId);
      }
    }
    // 页面/记录切换完再定位（编辑器重新挂载需要一点时间）
    window.setTimeout(() => setPendingBlockFocus(citation.blockId), 350);
  };

  if (editingConfig || !config) {
    return (
      <div className="ai">
        <div className="ai__title">AI 供应商</div>
        <div className="ai__hint">
          支持任何 OpenAI 兼容接口（OpenAI / DeepSeek / LiteLLM / Ollama…）。Key 只存在本机数据库，不上传。
        </div>

        <label className="ai__label">接口地址</label>
        <input
          className="clip-input"
          value={draft.baseUrl}
          placeholder="https://api.openai.com/v1"
          onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          spellCheck={false}
        />

        <label className="ai__label">API Key</label>
        <input
          className="clip-input"
          type="password"
          value={draft.apiKey}
          placeholder="sk-…"
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
          spellCheck={false}
        />

        <label className="ai__label">模型</label>
        <input
          className="clip-input"
          value={draft.model}
          placeholder="gpt-4o-mini"
          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          spellCheck={false}
        />

        <label className="ai__label">温度（0 稳定，1 发散）</label>
        <input
          className="clip-input"
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={draft.temperature}
          onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
        />

        {error && <div className="modal__error">{error}</div>}

        <div className="ai__row">
          <button
            className="btn"
            onClick={async () => {
              if (!draft.baseUrl.trim() || !draft.apiKey.trim() || !draft.model.trim()) {
                setError("接口地址、API Key、模型都要填");
                return;
              }
              await saveAiConfig(draft);
              setConfig(await loadAiConfig());
              setEditingConfig(false);
              setError(null);
            }}
          >
            保存
          </button>
          {config && (
            <button className="btn btn--sm" onClick={() => setEditingConfig(false)}>
              取消
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- 已配置：三栏 ---------------- */

  return (
    <div className="ai">
      <div className="ai__title">AI</div>
      <div className="ai__hint">
        {config.model} · {config.baseUrl.replace(/^https?:\/\//, "")}
      </div>

      {!hideTabs && (
        <div className="ai__tabs">
          {(
            [
              ["actions", t("aiTabActions")],
              ["chat", t("aiTabChat")],
              ["ask", t("aiTabAsk")],
              ["skills", t("aiTabSkills")],
              ["mcp", "MCP"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              className={`ai__tab${tab === key ? " ai__tab--on" : ""}`}
              onClick={() => {
                setTab(key);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "actions" && (
        <>
          <div className="ai__actions">
            {(["summary", "points", "rewrite"] as AiAction[]).map((action) => (
              <button
                key={action}
                className="btn btn--sm"
                disabled={busy !== null}
                onClick={() => void runAction(action)}
              >
                {busy === action ? t("aiProcessing") : AI_ACTIONS[action].label}
              </button>
            ))}
          </div>
          <input
            className="clip-input ai__instruction"
            value={instruction}
            placeholder={t("aiRewritePlaceholder")}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </>
      )}

      {tab === "chat" && (
        <AiChatView
          ref={chatRef}
          initialInput={pendingPrefill}
          pageId={contextKey ? null : (page?.id ?? null)}
          pageTitle={pageTitle || null}
          pageText={pageText || null}
          mcpServers={mcpServers}
          onCollapse={hideTabs ? toggleAiPanel : undefined}
        />
      )}

      {tab === "ask" && (
        <>
          <div className="ai__hint">
            问你的知识库（页面正文 + 剪藏记录）。
            {askStrict ? "严格模式：资料里没有就说没有。" : "宽松模式：允许补充，但会标注「资料外推测」。"}
          </div>
          <label className="ai__check">
            <input
              type="checkbox"
              checked={askStrict}
              onChange={(e) => setAskStrict(e.target.checked)}
            />
            严格模式
          </label>
          <div className="ai__row">
            <input
              className="clip-input"
              value={askInput}
              placeholder={t("aiAskPlaceholder")}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runAsk();
                }
              }}
              disabled={askBusy}
            />
            <button
              className="btn btn--sm"
              disabled={askBusy || !askInput.trim()}
              onClick={() => void runAsk()}
            >
              {askBusy ? "检索中…" : "提问"}
            </button>
          </div>

          {askError && <div className="modal__error">{askError}</div>}
          {askAnswer && <pre className="ai__output">{askAnswer}</pre>}

          {askCitations.length > 0 && (
            <div className="ai__citations">
              <div className="ai__cite-label">出处</div>
              {askCitations.map((citation) => (
                <button
                  key={citation.index}
                  className="ai__cite"
                  title="跳到原文这一段"
                  onClick={() => void openCitation(citation)}
                >
                  <span className="ai__cite-index">[{citation.index}]</span>
                  <span className="ai__cite-title">
                    {citation.title}
                    {citation.heading ? ` · ${citation.heading}` : ""}
                  </span>
                  <span className="ai__cite-text">{citation.text.slice(0, 90)}</span>
                </button>
              ))}
            </div>
          )}

          <button className="clip-server__toggle" onClick={() => setShowEmbed((v) => !v)}>
            向量模型设置（不填 = 只按关键词检索）
          </button>
          {showEmbed && (
            <div className="ai__embed">
              <input
                className="clip-input"
                value={embed.baseUrl}
                placeholder="接口地址（如 https://api.siliconflow.cn/v1）"
                onChange={(e) => setEmbed({ ...embed, baseUrl: e.target.value })}
                spellCheck={false}
              />
              <input
                className="clip-input"
                type="password"
                value={embed.apiKey}
                placeholder="API Key"
                onChange={(e) => setEmbed({ ...embed, apiKey: e.target.value })}
              />
              <input
                className="clip-input"
                value={embed.model}
                placeholder="模型名（如 BAAI/bge-m3）"
                onChange={(e) => setEmbed({ ...embed, model: e.target.value })}
              />
              <button className="btn btn--sm" onClick={() => void saveEmbedConfig(embed)}>
                保存向量设置
              </button>
            </div>
          )}
        </>
      )}

      {tab === "skills" && (
        <>
          {skillEditor ? (
            <div className="ai__skill-edit">
              <label className="ai__label">名称</label>
              <input
                className="clip-input"
                value={skillEditor.name}
                onChange={(e) => setSkillEditor({ ...skillEditor, name: e.target.value })}
              />
              <label className="ai__label">作用对象</label>
              <select
                className="clip-input"
                value={skillEditor.scope}
                onChange={(e) =>
                  setSkillEditor({ ...skillEditor, scope: e.target.value as AiSkill["scope"] })
                }
              >
                <option value="page">整页正文</option>
                <option value="selection">选中文字</option>
              </select>
              <label className="ai__label">提示词</label>
              <textarea
                className="ai__textarea"
                rows={6}
                value={skillEditor.system}
                placeholder="定义角色、输入与输出格式…"
                onChange={(e) => setSkillEditor({ ...skillEditor, system: e.target.value })}
              />
              <div className="ai__row">
                <button
                  className="btn btn--sm"
                  disabled={!skillEditor.name.trim() || !skillEditor.system.trim()}
                  onClick={async () => {
                    await saveSkill(skillEditor);
                    setSkills(await listSkills());
                    setSkillEditor(null);
                  }}
                >
                  保存技能
                </button>
                <button className="btn btn--sm" onClick={() => setSkillEditor(null)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="ai__skills">
                {skills.length === 0 && <div className="ai__hint">还没有技能。可以先用内置模板。</div>}
                {skills.map((skill) => (
                  <div className="ai__skill" key={skill.id}>
                    <div className="ai__skill-main">
                      <b>{skill.name}</b>
                      <span className="ai__skill-scope">
                        {skill.scope === "page" ? "整页" : "选中"}
                      </span>
                    </div>
                    <div className="ai__row">
                      <button
                        className="btn btn--sm"
                        disabled={busy !== null}
                        onClick={() => void runSkill(skill)}
                      >
                        {busy === `skill:${skill.id}` ? "处理中…" : "运行"}
                      </button>
                      <button className="btn btn--sm" onClick={() => setSkillEditor(skill)}>
                        编辑
                      </button>
                      <button
                        className="icon-btn"
                        title="删除技能"
                        onClick={async () => {
                          if (!confirm(`删除技能「${skill.name}」？`)) return;
                          await deleteSkill(skill.id);
                          setSkills(await listSkills());
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ai__row">
                <button className="btn btn--sm" onClick={() => setSkillEditor(makeSkill())}>
                  ＋ 新建技能
                </button>
                <button
                  className="btn btn--sm"
                  onClick={async () => {
                    await addPresetSkills();
                    setSkills(await listSkills());
                  }}
                >
                  加入内置模板
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === "mcp" && (
        <>
          {mcpEditor ? (
            <div className="ai__skill-edit">
              <label className="ai__label">名称</label>
              <input
                className="clip-input"
                value={mcpEditor.name}
                onChange={(e) => setMcpEditor({ ...mcpEditor, name: e.target.value })}
              />
              <label className="ai__label">MCP 地址（Streamable HTTP）</label>
              <input
                className="clip-input"
                value={mcpEditor.url}
                placeholder="https://example.com/mcp"
                spellCheck={false}
                onChange={(e) => setMcpEditor({ ...mcpEditor, url: e.target.value })}
              />
              <label className="ai__label">Token（可选）</label>
              <input
                className="clip-input"
                type="password"
                value={mcpEditor.token}
                onChange={(e) => setMcpEditor({ ...mcpEditor, token: e.target.value })}
              />
              <label className="ai__check">
                <input
                  type="checkbox"
                  checked={mcpEditor.enabled}
                  onChange={(e) => setMcpEditor({ ...mcpEditor, enabled: e.target.checked })}
                />
                启用（对话时自动带上它的工具）
              </label>
              <div className="ai__row">
                <button
                  className="btn btn--sm"
                  disabled={!mcpEditor.url.trim()}
                  onClick={async () => {
                    const bad = validateMcpUrl(mcpEditor.url);
                    if (bad) {
                      setMcpError(bad);
                      return;
                    }
                    await saveMcpServer(mcpEditor);
                    setMcpServers(await listMcpServers());
                    setMcpEditor(null);
                    setMcpError(null);
                  }}
                >
                  保存
                </button>
                <button className="btn btn--sm" onClick={() => setMcpEditor(null)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="ai__hint">
                浏览器直连 MCP 服务器（Streamable HTTP）。服务器需要允许 CORS；stdio 服务器要等桌面壳。
              </div>
              <div className="ai__skills">
                {mcpServers.length === 0 && <div className="ai__hint">还没有 MCP 服务器</div>}
                {mcpServers.map((server) => (
                  <div className="ai__skill" key={server.id}>
                    <div className="ai__skill-main">
                      <b>{server.name}</b>
                      <span className="ai__skill-scope">{server.enabled ? "已启用" : "已停用"}</span>
                    </div>
                    <div className="ai__mcp-url">{server.url}</div>
                    {mcpTools[server.id] && (
                      <div className="ai__mcp-tools">
                        {mcpTools[server.id].length === 0
                          ? "没有发现工具"
                          : mcpTools[server.id].map((tool) => (
                              <div key={tool.name}>
                                · {tool.name}
                                {tool.description ? ` — ${tool.description}` : ""}
                              </div>
                            ))}
                      </div>
                    )}
                    <div className="ai__row">
                      <button
                        className="btn btn--sm"
                        disabled={mcpBusy !== null}
                        onClick={() => void refreshMcpTools(server)}
                      >
                        {mcpBusy === server.id ? "连接中…" : "刷新工具"}
                      </button>
                      <button className="btn btn--sm" onClick={() => setMcpEditor(server)}>
                        编辑
                      </button>
                      <button
                        className="icon-btn"
                        title="删除服务器"
                        onClick={async () => {
                          if (!confirm(`删除 MCP 服务器「${server.name}」？`)) return;
                          await deleteMcpServer(server.id);
                          setMcpServers(await listMcpServers());
                          setMcpTools((prev) => {
                            const next = { ...prev };
                            delete next[server.id];
                            return next;
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ai__row">
                <button className="btn btn--sm" onClick={() => setMcpEditor(makeMcpServer())}>
                  ＋ 添加服务器
                </button>
              </div>
            </>
          )}
          {mcpError && <div className="modal__error">{mcpError}</div>}
        </>
      )}

      {error && <div className="modal__error">{error}</div>}

      {output && (
        <div className="ai__result">
          <div className="ai__result-label">{output.label}</div>
          <pre className="ai__output">{output.text}</pre>
          <div className="ai__row">
            <button className="btn btn--sm" onClick={() => void navigator.clipboard?.writeText(output.text)}>
              复制
            </button>
            {output.blockId ? (
              <button className="btn btn--sm" onClick={() => replaceBlock(output.blockId!, output.text)}>
                替换本段
              </button>
            ) : output.selection !== undefined ? (
              <button className="btn btn--sm" onClick={() => replaceSelection(output.text)}>
                替换选中
              </button>
            ) : (
              <button className="btn btn--sm" onClick={() => insertAsCallout(output.text)}>
                插入正文
              </button>
            )}
          </div>
        </div>
      )}

      <button className="clip-server__toggle" onClick={() => setEditingConfig(true)}>
        供应商设置
      </button>
    </div>
  );
}
