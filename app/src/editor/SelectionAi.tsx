import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { useBlockNoteEditor, useComponentsContext } from "@blocknote/react";
import {
  buildSelectionMessages,
  chat,
  loadAiConfig,
  SELECTION_ACTIONS,
  type AiConfig,
  type SelectionAction,
} from "../data/ai";
import { useStore } from "../data/store";

/**
 * W93：弹层状态放在工具条之外的模块 store 里。
 * 工具条会随编辑器失焦收起（子组件随之卸载），弹层若挂在它下面，
 * 真实点击的第一下 mousedown 就会把弹层连带毁掉——这也是历史弹层
 * 「点了没反应」的根因；提到外面后弹层活过工具条的开合。
 */
const useSelectionAi = create<{
  text: string | null;
  open: (text: string) => void;
  close: () => void;
}>((set) => ({
  text: null,
  open: (text) => set({ text }),
  close: () => set({ text: null }),
}));

export function SelectionAiButton() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext();

  if (!Components) return null;

  return (
    <Components.FormattingToolbar.Button
      mainTooltip="AI 处理选中文字"
      onClick={() => {
        const selected = editor.getSelectedText().trim();
        if (selected) useSelectionAi.getState().open(selected);
      }}
    >
      AI
    </Components.FormattingToolbar.Button>
  );
}

/** 挂在 PageEditor（工具条之外）：选区 AI 弹层宿主，编辑器失焦不影响它 */
export function SelectionAiHost({ editor }: { editor: EditorLike }) {
  const text = useSelectionAi((s) => s.text);
  if (!text) return null;
  return <SelectionAiDialog editor={editor} text={text} onClose={() => useSelectionAi.getState().close()} />;
}

/** 只依赖实际用到的方法：避免把不同 schema 的编辑器泛型带进 props */
type EditorLike = {
  insertInlineContent: (content: string, options?: { updateSelection?: boolean }) => void;
};

/**
 * 选区工具条上的 AI 按钮：选中文字 → 点 AI → 快捷动作 → 预览 → 替换选中。
 *
 * 为什么用弹窗而不是贴着工具栏的小浮层：
 *  - 结果可能很长，贴边浮层会把正文挤走；
 *  - 弹窗里能放错误、复制、替换三个动作，焦点也不会把编辑器选区弄丢。
 */
/**
 * 选区 AI 弹层（由 SelectionAiHost 挂载；快捷动作 → 预览 → 替换选中，
 * 结果可能很长所以用弹窗而非贴边浮层）。
 */
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

          {/* W93 语义对齐（10 号 §3）：选中文字随时可以转进 AI 面板，与「问问 AI」同一机制 */}
          <div className="ai__row">
            <button
              className="btn btn--sm"
              onClick={() => {
                useStore.getState().dispatchAiCommand({ kind: "selection", text });
                onClose();
              }}
            >
              在 AI 面板继续问
            </button>
          </div>

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
