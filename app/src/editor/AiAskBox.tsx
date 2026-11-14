import { useEffect, useRef, useState } from "react";
import { buildChatMessages, chat, loadAiConfig, type AiConfig } from "../data/ai";
import { extractBlocksText } from "../data/search";
import { useActiveDoc, useActivePage } from "../data/store";

/**
 * 空行按空格唤起的「问 AI」小框。
 *
 * 交互（Notion 那种）：
 *  - 在空段落里按空格 → 这里弹出，段落保持为空；
 *  - 输入问题回车 → 答案作为 🤖 着重块插在当前段落后；
 *  - Esc 取消。
 */
export function AiAskBox({
  onAnswer,
  onClose,
  position,
}: {
  /** 把答案写回正文 */
  onAnswer: (text: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AiConfig | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const page = useActivePage();
  const doc = useActiveDoc();

  useEffect(() => {
    void loadAiConfig().then(setConfig);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    const text = question.trim();
    if (!text || busy) return;
    if (!config) {
      setError("还没有配置 AI 供应商，先到右侧 AI 面板填一下。");
      return;
    }
    setBusy(true);
    setError(null);
    const pageText = doc
      ? extractBlocksText(doc as unknown[])
          .map((b) => b.text)
          .join("\n")
      : "";
    const messages = buildChatMessages([{ role: "user", content: text }], {
      title: page?.title ?? "",
      text: pageText,
    });
    const result = await chat(messages, config);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAnswer(result.text);
  };

  return (
    <div className="aiask" style={{ top: position.top, left: position.left }}>
      <input
        ref={inputRef}
        className="aiask__input"
        value={question}
        placeholder="问点什么…（Enter 发送 / Esc 取消）"
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void send();
          }
        }}
        disabled={busy}
      />
      {busy && <div className="aiask__hint">思考中…</div>}
      {error && <div className="aiask__error">{error}</div>}
    </div>
  );
}
