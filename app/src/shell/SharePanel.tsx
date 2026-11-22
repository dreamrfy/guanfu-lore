import { useCallback, useEffect, useState } from "react";
import { createPublicShare, fetchShareState, revokePublicShare } from "../data/shareApi";
import { AppIcon } from "../design/icons";
import type { IconSetId } from "../design/icons";

/**
 * 公开分享面板内容（W110 形态 + W111 链接生成 + W113 权限语义）。
 * 语义：一个页面一个有效链接；「获得链接的人」选中 = 公开开启，「仅自己」= 关闭。
 * 服务端：POST /api/share（幂等）/ GET /api/share / DELETE /api/share。
 */
type Load =
  | { kind: "loading" }
  | { kind: "ready"; shared: boolean; url: string | null }
  | { kind: "error"; message: string; shared: boolean; url: string | null };

export function SharePanelContent({
  pageId,
  iconSet,
  onToast,
}: {
  pageId: string;
  iconSet: IconSetId;
  onToast: (msg: string) => void;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoad({ kind: "loading" });
    fetchShareState(pageId)
      .then((s) => {
        if (alive) setLoad({ kind: "ready", shared: s.shared, url: s.url });
      })
      .catch((e) => {
        if (alive) setLoad({ kind: "error", message: String((e as Error).message ?? e), shared: false, url: null });
      });
    return () => {
      alive = false;
    };
  }, [pageId]);

  const setPublic = useCallback(
    async (on: boolean) => {
      setBusy(true);
      try {
        const s = on ? await createPublicShare(pageId) : await revokePublicShare(pageId);
        setLoad({ kind: "ready", shared: s.shared, url: s.url });
        onToast(on ? "公开链接已生成" : "已关闭公开分享，旧链接立即失效");
      } catch (e) {
        onToast(String((e as Error).message ?? e));
        setLoad((prev) =>
          prev.kind === "ready" ? prev : { kind: "error", message: String((e as Error).message ?? e), shared: false, url: null },
        );
      } finally {
        setBusy(false);
      }
    },
    [pageId, onToast],
  );

  const copy = useCallback(
    async (text: string, toast: string) => {
      try {
        await navigator.clipboard.writeText(text);
        onToast(toast);
      } catch {
        onToast("复制失败");
      }
    },
    [onToast],
  );

  const shared = load.kind === "ready" && load.shared;
  const url = load.kind === "ready" ? load.url : null;
  const pageLink = `${location.origin}${location.pathname}?page=${pageId}`;

  return (
    <div className="popover share-popover" data-testid="share-panel">
      <div className="share-tabs" role="tablist" aria-label="分享方式">
        <button className="share-tab share-tab--active" role="tab" aria-selected="true">
          公开分享
        </button>
        <button className="share-tab" role="tab" aria-selected="false" disabled title="观复不做协作，邀请协作不在范围内">
          邀请协作
        </button>
      </div>

      <div className="share-public">
        <div className="share-public__row">
          <div className="share-public__text">
            <b>公开分享</b>
            <span>
              {load.kind === "loading"
                ? "读取分享状态…"
                : shared
                  ? "获得链接的人可以只读查看（无需登录）"
                  : "开启后生成公开链接，链接永久有效直到你关闭"}
            </span>
          </div>
          <span className={`share-badge${shared ? " share-badge--on" : ""}`} data-testid="share-badge">
            {load.kind === "loading" ? "…" : shared ? "公开" : "仅自己"}
          </span>
        </div>

        <div className="share-perms" role="group" aria-label="谁可以看">
          <button
            className={`share-perm${shared ? "" : " share-perm--active"}`}
            aria-pressed={!shared}
            disabled={load.kind !== "ready" || busy}
            title="关闭公开分享，旧链接立即失效"
            onClick={() => void setPublic(false)}
          >
            仅自己
          </button>
          <button
            className={`share-perm${shared ? " share-perm--active" : ""}`}
            aria-pressed={shared}
            disabled={load.kind !== "ready" || busy}
            title="生成公开链接，获得链接的人可只读查看"
            onClick={() => void setPublic(true)}
          >
            获得链接的人
          </button>
        </div>

        {load.kind === "error" && (
          <div className="share-error" role="alert">
            {load.message}
            <button className="btn btn--sm" onClick={() => void setPublic(shared)} disabled={busy}>
              重试
            </button>
          </div>
        )}

        {load.kind === "ready" && shared && url && (
          <div className="share-linkrow" data-testid="share-linkrow">
            <input className="share-link" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
            <button
              className="btn btn--sm"
              data-testid="share-copy"
              disabled={busy}
              onClick={() => void copy(url, "公开链接已复制")}
            >
              复制链接
            </button>
          </div>
        )}
      </div>

      <div className="share-sep" />

      <button className="menu-item" onClick={() => void copy(pageLink, "页面链接已复制")}>
        <AppIcon name="share" set={iconSet} size={14} />
        复制页面链接
      </button>
      <div className="share-link" title={pageLink}>
        {pageLink}
      </div>
      <div className="share-footnote">
        公开链接经 share.guanfu.app 提供只读页面；页面内容需先同步到服务端。
      </div>
    </div>
  );
}