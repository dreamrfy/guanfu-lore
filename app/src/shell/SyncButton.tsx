import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { conflictList } from "../data/sync";
import { judgeAndMaybeMerge, type DiffBlock } from "../data/conflictAi";

type AiOutcome = { merged: boolean; reason: string; error?: string; diff?: DiffBlock[] };

/**
 * 同步按钮（决策 D4）。
 *
 * 说明白一点：
 *  - 待推送 N：本地改了还没上云的条数（断网时会攒着）；
 *  - 冲突 N：服务器和本地改了同一处，本地版本已存成副本，等你选；
 *  - 同步走的是**剪藏服务那台**（地址和 Token 复用「快速剪藏」里的配置）。
 */
export function SyncButton() {
  const syncStatus = useStore((s) => s.syncStatus);
  const runSyncNow = useStore((s) => s.runSyncNow);
  const refreshSyncStatus = useStore((s) => s.refreshSyncStatus);
  const resolveSyncConflict = useStore((s) => s.resolveSyncConflict);
  const autoSync = useStore((s) => s.autoSync);
  const setAutoSync = useStore((s) => s.setAutoSync);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<number, AiOutcome>>({});
  const [aiBusy, setAiBusy] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<
    Array<{ id: number; entity: string; entityId: string; payload: unknown; serverSeq: number; createdAt: number }>
  >([]);

  const loadConflicts = () => {
    void conflictList().then(setConflicts);
  };

  useEffect(() => {
    void refreshSyncStatus();
    loadConflicts();
  }, [refreshSyncStatus]);

  const badge = syncStatus.pending + syncStatus.conflicts;

  return (
    <div style={{ position: "relative" }}>
      <button
        className="icon-btn"
        title="同步（与剪藏服务同一台）"
        onClick={() => {
          setOpen((v) => !v);
          void refreshSyncStatus();
          loadConflicts();
        }}
      >
        同步
        {badge > 0 && <span className="sync-badge">{badge}</span>}
      </button>

      {open && (
        <div className="popover popover--wide sync-pop">
          <div className="panel__row">
            <span>待推送</span>
            <b>{syncStatus.pending} 条</b>
          </div>
          <div className="panel__row">
            <span>冲突副本</span>
            <b>{syncStatus.conflicts} 条</b>
          </div>
          <div className="panel__row">
            <span>上次同步</span>
            <b>
              {syncStatus.lastSyncAt
                ? new Date(syncStatus.lastSyncAt).toLocaleString("zh-CN", { hour12: false })
                : "还没同步过"}
            </b>
          </div>

          <label className="ai__check">
            <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
            自动同步（每分钟一次，有改动就立刻推）
          </label>

          <div className="menu-sep" />

          <button
            className="btn btn--sm"
            disabled={syncStatus.busy}
            onClick={async () => {
              const result = await runSyncNow();
              loadConflicts();
              setMessage(
                result.ok
                  ? `同步完成：拉取 ${result.pulled} 条、推送 ${result.pushed} 条${result.conflicts ? `、冲突 ${result.conflicts} 条` : ""}`
                  : `同步失败：${result.error ?? "未知原因"}`
              );
            }}
          >
            {syncStatus.busy ? "同步中…" : "立即同步"}
          </button>

          {message && <div className="sync-note">{message}</div>}

          {conflicts.length > 0 && (
            <>
              <div className="menu-sep" />
              <div className="sync-note">下面这些是冲突副本（同一处被改过）：</div>
              {conflicts.map((c) => (
                <div className="sync-conflict" key={c.id}>
                  <div className="sync-conflict__title">
                    {c.entity} · {c.entityId.slice(0, 8)}
                  </div>
                  <div className="sync-conflict__row">
                    <button
                      className="btn btn--sm"
                      onClick={async () => {
                        await resolveSyncConflict(c.id, "keep-server");
                        loadConflicts();
                        void refreshSyncStatus();
                      }}
                    >
                      保留服务器版
                    </button>
                    <button
                      className="btn btn--sm"
                      onClick={async () => {
                        await resolveSyncConflict(c.id, "use-mine");
                        loadConflicts();
                        void refreshSyncStatus();
                      }}
                    >
                      采用我的版本
                    </button>
                    <button
                      className="btn btn--sm"
                      disabled={aiBusy !== null}
                      title="AI 判断两处改动是不是同一处；不是就自动合并进云端"
                      onClick={async () => {
                        setAiBusy(c.id);
                        const outcome = await judgeAndMaybeMerge({
                          entity: c.entity,
                          entityId: c.entityId,
                          myPayload: c.payload,
                          serverSeq: c.serverSeq,
                        });
                        setAiResults((prev) => ({ ...prev, [c.id]: outcome }));
                        if (outcome.merged) {
                          // 合并内容已经推上去了，本地这份副本就可以收掉
                          await resolveSyncConflict(c.id, "keep-server");
                          loadConflicts();
                          void refreshSyncStatus();
                        }
                        setAiBusy(null);
                      }}
                    >
                      {aiBusy === c.id ? "判定中…" : "AI 判定并合并"}
                    </button>
                  </div>
                  {aiResults[c.id] && (
                    <div className="sync-conflict__ai">
                      <div className="sync-conflict__verdict">
                        {aiResults[c.id]!.merged
                          ? "已合并进云端（两边改动不在同一处）"
                          : aiResults[c.id]!.error
                            ? `判定未完成：${aiResults[c.id]!.error}`
                            : `保留副本：${aiResults[c.id]!.reason || "两处改的是同一处"}`}
                      </div>
                      {(aiResults[c.id]!.diff ?? [])
                        .filter((d) => d.kind !== "same")
                        .slice(0, 6)
                        .map((d, index) => (
                          <div className={`sync-diff sync-diff--${d.kind}`} key={index}>
                            <span className="sync-diff__tag">
                              {d.kind === "changed"
                                ? "同一处"
                                : d.kind === "serverOnly"
                                  ? "仅服务器"
                                  : "仅我有"}
                            </span>
                            {d.text}
                            {d.otherText && <span className="sync-diff__other">（我：{d.otherText}）</span>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          <div className="menu-sep" />
          <div className="sync-note">
            同步地址与 Token 复用「快速剪藏 → 剪藏服务地址」里的配置。
          </div>
        </div>
      )}
    </div>
  );
}
