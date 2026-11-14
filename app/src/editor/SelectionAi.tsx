import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBlockNoteEditor, useComponentsContext } from "@blocknote/react";
import {
  buildSelectionMessages,
  chat,
  loadAiConfig,
  SELECTION_ACTIONS,
  type AiConfig,
  type SelectionAction,
} from "../data/ai";

/**
 * 选区工具条上的 AI 按钮：选中文字 → 点 AI → 快捷动作 → 预览 → 替换选中。
 *
 * 为什么用弹窗而不是贴着工具栏的小浮层：
 *  - 结果可能很长，贴边浮层会把正文挤走；
 *  - 弹窗里能放错误、复制、替换三个动作，焦点也不会把编辑器选区弄丢。
 */
export function SelectionAiButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext();
  const [text, setText] = useState<string | null>(null);

  if (!Components) return null;

  return (
    <>
      <Components.FormattingToolbar.Button
        mainTooltip="AI 处理选中文字"
        onClick={() => {
          const selected = editor.getSelectedText().trim();
          if (selected) setText(selected);
        }}
      >
        AI
      </Components.FormattingToolbar.Button>
      {text && <SelectionAiDialog editor={editor} text={text} onClose={() => setText(null)} />}
    </>
  );
}

/** 只依赖实际用到的方法：避免把不同 schema 的编辑器泛型带进 props */
type EditorLike = {
  insertInlineContent: (content: string, options?: { updateSelection?: boolean }) => void;
};

function SelectionAiDialog({
  editor,
  text,
  onClose,
}: {
  editor: EditorLike;
  text: string;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [busy, setBusy] = useState<SelectionAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  useEffect(() => {
    void loadAiConfig().then(setConfig);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const run = async (action: SelectionAction) => {
    if (!config) return;
    const messages = buildSelectionMessages(action, text);
    if (!messages) return;
    setError(null);
    setOutput(null);
    setBusy(action);
    const result = await chat(messages, config);
    setBusy(null);
    if (!result.ok) setError(result.error);
    else setOutput(result.text);
  };

  return createPortal(
    <div className="modal" onMouseDown={() => !busy && onClose()}>
      <div className="modal__card selai" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <b>AI 处理选中文字</b>
          <button className="icon-btn" title="关闭" onClick={onClose} disabled={busy !== null}>
            ×
          </button>
        </div>

        <div className="modal__body">
          <div className="selai__source">{text.length > 260 ? text.slice(0, 260) + "…" : text}</div>

          {!config ? (
            <div className="modal__error">还没有配置 AI 供应商，先到右侧 AI 面板填一下。</div>
          ) : (
            <div className="ai__row">
              {(Object.keys(SELECTION_ACTIONS) as SelectionAction[]).map((action) => (
                <button
                  key={action}
                  className="btn btn--sm"
                  disabled={busy !== null}
                  onClick={() => void run(action)}
                >
                  {busy === action ? "处理中…" : SELECTION_ACTIONS[action].label}
                </button>
              ))}
            </div>
          )}

          {error && <div className="modal__error">{error}</div>}

          {output && (
            <div className="ai__result">
              <pre className="ai__output">{output}</pre>
              <div className="ai__row">
                <button
                  className="btn btn--sm"
                  onClick={() => void navigator.clipboard?.writeText(output)}
                >
                  复制
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    editor.insertInlineContent(output, { updateSelection: true });
                    onClose();
                  }}
                >
                  替换选中
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
