import { useEffect, useRef, useState } from "react";
import type { CollectionRow, RecordRow } from "../data/db";
import { loadAiConfig, type AiConfig } from "../data/ai";
import {
  aiFieldIds,
  aiStatusOptionId,
  runBatch,
  selectBatchRecords,
  type BatchResult,
  type BatchScope,
} from "../data/aiBatch";
import { useStore } from "../data/store";

/**
 * 剪藏库的批量 AI 总结。
 *
 * 顺序执行、逐条落库（不是最后一次性写），所以：
 *  - 中途停止时已完成的记录不会丢；
 *  - 关掉对话框也不会把已生成的摘要回滚。
 */
export function AiBatchDialog({
  collection,
  records,
  onClose,
}: {
  collection: CollectionRow;
  records: RecordRow[];
  onClose: () => void;
}) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [working, setWorking] = useState<CollectionRow>(collection);
  const [scope, setScope] = useState<BatchScope>("missing");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; title: string } | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    void loadAiConfig().then(setConfig);
    void useStore
      .getState()
      .ensureAiFields(collection.id)
      .then((next) => {
        if (next) setWorking(next);
      });
  }, [collection.id]);

  const targets = selectBatchRecords(records, working, scope);
  const missingCount = selectBatchRecords(records, working, "missing").length;

  const start = async () => {
    if (!config) {
      setError("还没有配置 AI 供应商，先到右侧 AI 面板填一下。");
      return;
    }
    if (targets.length === 0) return;
    setError(null);
    setResult(null);
    setRunning(true);
    cancelled.current = false;
    const store = useStore.getState();
    const { summaryId, statusId } = aiFieldIds(working);
    const statusOption = (name: Parameters<typeof aiStatusOptionId>[1]) =>
      aiStatusOptionId(working, name);

    const outcome = await runBatch({
      collection: working,
      records: targets,
      config,
      onProgress: setProgress,
      isCancelled: () => cancelled.current,
      apply: (recordId, patch) => {
        if (statusId && patch.status) {
          const optionId = statusOption(patch.status);
          if (optionId) store.setCell(collection.id, recordId, statusId, optionId);
        }
        if (summaryId && patch.summary !== undefined) {
          store.setCell(collection.id, recordId, summaryId, patch.summary);
        }
      },
    });
    setRunning(false);
    setProgress(null);
    setResult(outcome);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" onMouseDown={() => !running && onClose()}>
      <div className="modal__card batch" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <b>AI 批量总结</b>
          <button className="icon-btn" title="关闭" onClick={onClose} disabled={running}>
            ×
          </button>
        </div>

        <div className="modal__body">
          <div className="modal__hint">
            会逐条写入「AI 摘要」和「AI 状态」两列；中途停止时已完成的记录会保留。
          </div>

          <div className="batch__scope">
            <label className="ai__check">
              <input
                type="radio"
                name="batch-scope"
                checked={scope === "missing"}
                onChange={() => setScope("missing")}
                disabled={running}
              />
              只处理未生成的（{missingCount} 条）
            </label>
            <label className="ai__check">
              <input
                type="radio"
                name="batch-scope"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                disabled={running}
              />
              全部记录（{records.length} 条）
            </label>
          </div>

          <div className="modal__hint">本次将处理 {targets.length} 条。</div>

          {progress && (
            <div className="batch__progress">
              <div className="batch__bar">
                <div
                  className="batch__bar-fill"
                  style={{ width: `${Math.round(((progress.index - 1) / Math.max(1, progress.total)) * 100)}%` }}
                />
              </div>
              <div className="batch__label">
                正在处理 {progress.index}/{progress.total}：{progress.title}
              </div>
            </div>
          )}

          {error && <div className="modal__error">{error}</div>}
          {result && (
            <div className={result.failed > 0 ? "modal__error" : "modal__ok"}>
              {result.cancelled ? "已停止。" : "已完成。"}成功 {result.done} 条，失败 {result.failed} 条。
            </div>
          )}

          <div className="ai__row">
            {!running ? (
              <button className="btn" onClick={() => void start()} disabled={targets.length === 0}>
                开始总结
              </button>
            ) : (
              <button
                className="btn"
                onClick={() => {
                  cancelled.current = true;
                }}
              >
                停止
              </button>
            )}
            {!running && (
              <button className="btn btn--sm" onClick={onClose}>
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
