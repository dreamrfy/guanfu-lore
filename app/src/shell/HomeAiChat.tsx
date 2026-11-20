import { useEffect, useRef, useState } from "react";
import { listMcpServers, type McpServerConfig } from "../data/mcp";
import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";
import { AiChatView, type AiChatHandle } from "./AiChatView";

/**
 * W94 桌面主页（=FlowUs /chat 形态，规格 06 §1）：居中 AI logo + 能力 chips + 大输入框。
 * 发出第一条消息后从「大输入框」形态切换成对话形态（AiChatView 承担消息流/停止/落库/历史，
 * 隐藏挂载在对话区，主页大输入框通过句柄 send() 进入）。
 * chip 点击=预填对应提示词【暂定】（规格未记录 chip 行为，属模块 8 范围）。
 * 未取（规格 06 §1）：输入框聚焦技能面板、积分/模型下拉真功能、连接应用列表。
 */
const CHIP_PROMPTS: { label: string; prompt: string }[] = [
  { label: "图片", prompt: "帮我写一段图片生成的提示词：" },
  { label: "视频", prompt: "帮我写一段视频脚本：" },
  { label: "幻灯片", prompt: "帮我把下面的内容整理成幻灯片大纲：" },
  { label: "研究", prompt: "帮我研究这个课题：" },
  { label: "多维表", prompt: "帮我把下面的内容整理成多维表字段设计：" },
  { label: "可视化", prompt: "帮我把下面的数据做成可视化方案：" },
];

export function HomeAiChat() {
  const iconSet = useStore((s) => s.iconSet);
  const chatRef = useRef<AiChatHandle | null>(null);
  const [count, setCount] = useState(0);
  const [draft, setDraft] = useState("");
  // 主页没有 MCP 编辑 UI，静态加载一次【暂定】（面板页签里的增删改仍实时生效于面板对话）
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);

  useEffect(() => {
    void listMcpServers().then(setMcpServers);
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    chatRef.current?.send(text);
  };

  return (
    <div className="homeai">
      {count === 0 && (
        <div className="homeai__hero">
          <div className="homeai__logo">
            <AppIcon name="ai" set={iconSet} size={56} />
          </div>
          <div className="homeai__chips">
            {CHIP_PROMPTS.map((c) => (
              <button
                key={c.label}
                className="homeai__chip"
                title={c.prompt}
                onClick={() => setDraft(c.prompt)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="homeai__box">
            <textarea
              className="homeai__input"
              value={draft}
              placeholder="问任何问题，输入 / 选择技能"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="homeai__boxbar">
              <div className="homeai__boxbar-side">
                <button className="homeai__boxbtn" title="添加附件【暂定·模块 8】" disabled>
                  ＋
                </button>
                <button className="homeai__boxbtn" title="仅网络【暂定·模块 8】" disabled>
                  🌐 仅网络 ⌄
                </button>
              </div>
              <div className="homeai__boxbar-side">
                <button className="homeai__boxbtn" title="积分【暂定·W102 商业化槽位替换】" disabled>
                  ✨ 1,997
                </button>
                <button className="homeai__boxbtn" title="模型【暂定·模块 8】" disabled>
                  Auto ⌄
                </button>
                <button className="homeai__boxbtn" title="语音输入【暂定·模块 8】" disabled>
                  🎤
                </button>
                <button className="homeai__send" onClick={send} disabled={!draft.trim()}>
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 空态时隐藏挂载：主页大输入框 send() 走它发起真实对话，首条消息到达后切为对话形态 */}
      <div className={`homeai__chat${count === 0 ? " homeai__chat--hidden" : ""}`}>
        <AiChatView
          ref={chatRef}
          pageId={null}
          pageTitle={null}
          pageText={null}
          allowPageContext={false}
          showTools
          showHistoryToggle
          emptyHint="和 AI 对话。会话自动保存，刷新不丢。"
          onCountChange={setCount}
          mcpServers={mcpServers}
        />
      </div>
    </div>
  );
}
