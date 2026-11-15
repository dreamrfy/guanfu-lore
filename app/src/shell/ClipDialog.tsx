import { useEffect, useState } from "react";
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
 * 「快速剪藏」入口 + 对话框。
 *
 * 粘贴链接 → 调本地剪藏服务（server/src/clipServer.ts）→ 落进「剪藏库」表的记录。
 * 服务没起来时给的是可执行的提示，而不是一句"失败了"。
 */
export function ClipButton() {
  const [open, setOpen] = useState(false);
  const iconSet = useStore((s) => s.iconSet);
  const { t } = useLang();

  return (
    <>
      <button
        className="icon-btn"
        style={{ width: "100%", justifyContent: "flex-start" }}
        onClick={() => setOpen(true)}
      >
        <AppIcon name="inbox" set={iconSet} />
        {t("clipEntry")}
      </button>
      {open && <ClipDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ClipDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
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
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);

    // 先看本地有没有同链接的记录：有就直接打开，不必再抓一遍
    const state = useStore.getState();
    const existingCollection = state.collections.find((c) => c.name === CLIP_COLLECTION_NAME);
    if (existingCollection) {
      await state.ensureRecords(existingCollection.id);
      const existing = findExistingClipRecord(value, useStore.getState().collections.find((c) => c.id === existingCollection.id));
      if (existing) {
        state.openCollection(existingCollection.id);
        state.openRecord(existingCollection.id, existing.id);
        setDone("这篇之前已经剪藏过，已为你打开原记录");
        setBusy(false);
        window.setTimeout(onClose, 700);
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
      await ingestClip(result);
      setDone(`已存入「${CLIP_COLLECTION_NAME}」：${result.clip.title}`);
      setBusy(false);
      window.setTimeout(onClose, 500);
    } catch (e) {
      setError("已抓到内容，但写入本地库失败：" + String((e as Error)?.message ?? e));
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" onMouseDown={() => !busy && onClose()}>
      <div className="modal__card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <b>{t("clipEntry")}</b>
          <button className="icon-btn" title="关闭" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>

        <div className="modal__body">
          <label className="modal__label" htmlFor="clip-url">
            粘贴链接
          </label>
          <div className="modal__row">
            <input
              id="clip-url"
              className="clip-input"
              autoFocus
              value={url}
              placeholder="公众号文章链接 / B站视频链接（b23.tv 或 bilibili.com）"
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

          <div className="modal__hint">
            第一批支持公众号文章与 B 站视频；抓取会下载正文与图片，页面多图时可能需要十几秒。
          </div>

          {busy && <div className="modal__status">正在抓取并保存，请稍候…</div>}
          {error && <div className="modal__error">{error}</div>}
          {done && <div className="modal__ok">{done}</div>}

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
        </div>
      </div>
    </div>
  );
}
