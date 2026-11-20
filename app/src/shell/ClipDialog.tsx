import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n";
import {
  DEFAULT_CLIP_SERVER,
  loadClipServerUrl,
  loadClipToken,
  requestClip,
  saveClipServerUrl,
  saveClipToken,
} from "../data/clipApi";
import {
  CLIP_COLLECTION_NAME,
  findExistingClipRecord,
  ingestClip,
} from "../data/clipIngest";
import {
  fetchServerClipIndex,
  importServerClip,
  type ServerClipEntry,
} from "../data/clipBox";
import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

/**
 * 「快速剪藏」入口 + 对话框（W121）。
 *
 * 粘贴链接 → 调本地剪藏服务（server/src/clipServer.ts）→ 落进「剪藏库」表的记录。
 * 抓取过程、成功、同链接已存在、失败四种状态都在同一个面板里给出下一步动作，
 * 不再抓完就自动关窗（用户看不到结果、也没法「继续」）。
 */
export function ClipButton() {
  const [open, setOpen] = useState(false);
  const [initialUrl, setInitialUrl] = useState("");
  const iconSet = useStore((s) => s.iconSet);
  const { t } = useLang();

  // 桌面快捷键 / 剪贴板提示条通过 gf:open-clip-dialog 广播；可带 detail.url 预填并直接抓取
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ url?: string }>).detail;
      setInitialUrl(typeof detail?.url === "string" ? detail.url : "");
      setOpen(true);
    };
    window.addEventListener("gf:open-clip-dialog", onOpen);
    return () => window.removeEventListener("gf:open-clip-dialog", onOpen);
  }, []);

  return (
    <>
      <button
        className="icon-btn"
        style={{ width: "100%", justifyContent: "flex-start" }}
        onClick={() => {
          setInitialUrl("");
          setOpen(true);
        }}
      >
        <AppIcon name="inbox" set={iconSet} />
        {t("clipEntry")}
      </button>
      {open && (
        <ClipDialog
          initialUrl={initialUrl}
          onClose={() => {
            setOpen(false);
            setInitialUrl("");
          }}
        />
      )}
    </>
  );
}

type ClipDone = {
  title: string;
  collectionId: string;
  recordId: string;
  duplicate: boolean;
};

function recordTitle(collectionId: string, recordId: string): string {
  const state = useStore.getState();
  const collection = state.collections.find((c) => c.id === collectionId);
  const record = (state.records[collectionId] ?? []).find((r) => r.id === recordId);
  if (!collection || !record) return "（无标题）";
  const field = collection.fields.find((f) => f.name === "标题") ?? collection.fields[0];
  return String(record.values[field.id] ?? "") || "（无标题）";
}

function ClipDialog({ onClose, initialUrl = "" }: { onClose: () => void; initialUrl?: string }) {
  const { t } = useLang();
  const iconSet = useStore((s) => s.iconSet);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ClipDone | null>(null);
  const [server, setServer] = useState(DEFAULT_CLIP_SERVER);
  const [token, setToken] = useState("");
  const [showBox, setShowBox] = useState(false);
  // 服务器剪藏箱：微信转发进来的那些（服务器已经自动收好了，这里只是导入）
  const [box, setBox] = useState<ServerClipEntry[]>([]);
  const [boxBusy, setBoxBusy] = useState<string | null>(null);
  const [boxMsg, setBoxMsg] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(false);

  useEffect(() => {
    void loadClipServerUrl().then(setServer);
    void loadClipToken().then(setToken);
  }, []);

  // 展开「服务器剪藏箱」时才去拉清单（省一次请求）
  useEffect(() => {
    if (!showBox) return;
    void fetchServerClipIndex().then(setBox);
  }, [showBox]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async () => {
    const value = url.trim();
    if (!value || busy) {
      if (!value) inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);

    // 先看本地有没有同链接的记录：有就直接给「打开」，不必再抓一遍
    const state = useStore.getState();
    const existingCollection = state.collections.find((c) => c.name === CLIP_COLLECTION_NAME);
    if (existingCollection) {
      await state.ensureRecords(existingCollection.id);
      const existing = findExistingClipRecord(
        value,
        useStore.getState().collections.find((c) => c.id === existingCollection.id),
      );
      if (existing) {
        setDone({
          title: recordTitle(existingCollection.id, existing.id),
          collectionId: existingCollection.id,
          recordId: existing.id,
          duplicate: true,
        });
        setBusy(false);
        return;
      }
    }

    const result = await requestClip(value);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    try {
      const { collectionId, recordId } = await ingestClip(result, { open: false });
      setDone({
        title: result.clip.title || value,
        collectionId,
        recordId,
        duplicate: false,
      });
      setBusy(false);
    } catch (e) {
      setError("已抓到内容，但写入本地库失败：" + String((e as Error)?.message ?? e));
      setBusy(false);
    }
  };

  // 剪贴板提示条点「收进」：带链接打开弹层，直接开始抓取（≤2 次点击）
  useEffect(() => {
    if (initialUrl.trim()) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDone = async () => {
    if (!done) return;
    const state = useStore.getState();
    await state.openCollection(done.collectionId);
    state.openRecord(done.collectionId, done.recordId);
    onClose();
  };

  const continueClip = () => {
    setUrl("");
    setError(null);
    setDone(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openOriginal = () => {
    const value = url.trim();
    if (value) window.open(value, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      data-testid="clip-dialog"
      onMouseDown={() => !busy && onClose()}
    >
      <div className="modal__card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <b>{t("clipEntry")}</b>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            <AppIcon name="close" set={iconSet} />
          </button>
        </div>

        <div className="modal__body">
          {!done && (
            <>
              <label className="modal__label" htmlFor="clip-url">
                {t("clipPasteLabel")}
              </label>
              <div className="modal__row">
                <input
                  ref={inputRef}
                  id="clip-url"
                  className="clip-input"
                  autoFocus
                  value={url}
                  placeholder={t("clipInputPlaceholder")}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                  disabled={busy}
                />
                <button className="btn" onClick={() => void submit()} disabled={busy || !url.trim()}>
                  {busy ? t("clipFetching") : t("clipButton")}
                </button>
              </div>

              <div className="modal__hint">{t("clipHint")}</div>

              {busy && (
                <div className="clip-progress" role="progressbar" aria-label={t("clipFetching")}>
                  <span />
                </div>
              )}

              {error && (
                <div className="clip-result clip-result--error" data-testid="clip-error" aria-live="polite">
                  <div className="clip-result__icon">!</div>
                  <div className="clip-result__main">
                    <b>{t("clipFailedHint")}</b>
                    <span title={error}>{error}</span>
                  </div>
                  <div className="clip-result__actions">
                    <button className="btn btn--sm" onClick={() => void submit()} disabled={busy || !url.trim()}>
                      {t("clipRetry")}
                    </button>
                    <button className="btn btn--sm" onClick={openOriginal}>
                      {t("clipOpenOriginal")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {done && (
            <div
              className={`clip-result${done.duplicate ? " clip-result--duplicate" : ""}`}
              data-testid={done.duplicate ? "clip-duplicate" : "clip-success"}
              aria-live="polite"
            >
              <div className="clip-result__icon">{done.duplicate ? "↺" : "✓"}</div>
              <div className="clip-result__main">
                <b>{done.duplicate ? t("clipDuplicateTitle") : t("clipSuccessTitle")}</b>
                <span title={done.title}>{done.title}</span>
              </div>
              <div className="clip-result__actions">
                <button className="btn btn--sm" onClick={() => void openDone()}>
                  {t("clipOpen")}
                </button>
                <button className="btn btn--sm" onClick={continueClip}>
                  {t("clipContinue")}
                </button>
              </div>
            </div>
          )}

          {!done && (
            <>
              <button className="clip-server__toggle" onClick={() => setShowBox((v) => !v)}>
                服务器剪藏箱（微信转发自动收进来的）
              </button>
              {showBox && (
                <div className="clip-box">
                  {box.length === 0 && <div className="ai__hint">服务器上还没有剪藏（把文章转发给微信客服即可）。</div>}
                  {box.map((entry) => (
                    <div className="clip-box__item" key={entry.id}>
                      <span className="clip-box__title">{entry.title || "（无标题）"}</span>
                      <button
                        className="btn btn--sm"
                        disabled={boxBusy !== null}
                        onClick={async () => {
                          setBoxBusy(entry.id);
                          setBoxMsg(null);
                          const result = await importServerClip(entry.id);
                          setBoxMsg(
                            result.ok
                              ? result.skipped
                                ? `「${result.title}」之前已经导入过，跳过`
                                : `已导入「${result.title}」到剪藏库`
                              : `导入失败：${result.error}`
                          );
                          setBoxBusy(null);
                        }}
                      >
                        {boxBusy === entry.id ? "导入中…" : "导入"}
                      </button>
                    </div>
                  ))}
                  {boxMsg && <div className="ai__hint">{boxMsg}</div>}
                </div>
              )}

              <button className="clip-server__toggle" onClick={() => setShowServer((v) => !v)}>
                {showServer ? "收起" : "剪藏服务地址"}（{server}）
              </button>
              {showServer && (
                <>
                  <div className="modal__row">
                    <input
                      className="clip-input"
                      value={server}
                      onChange={(e) => setServer(e.target.value)}
                      onBlur={() => void saveClipServerUrl(server)}
                      spellCheck={false}
                    />
                    <button
                      className="btn btn--sm"
                      onClick={() => {
                        void saveClipServerUrl(server);
                        setShowServer(false);
                      }}
                    >
                      保存
                    </button>
                  </div>
                  <div className="modal__row">
                    <input
                      className="clip-input"
                      type="password"
                      value={token}
                      placeholder="访问 Token（服务端设了 CLIP_TOKEN 才需要）"
                      onChange={(e) => setToken(e.target.value)}
                      onBlur={() => void saveClipToken(token)}
                      spellCheck={false}
                    />
                    <button className="btn btn--sm" onClick={() => void saveClipToken(token)}>
                      存 Token
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}