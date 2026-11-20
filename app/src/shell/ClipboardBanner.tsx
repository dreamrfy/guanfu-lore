import { useEffect, useState } from "react";
import { useLang } from "../i18n";
import { dismissClipLink, extractClipLink, isClipLinkDismissed } from "../data/clipClipboard";
import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

/**
 * W122 · 剪贴板入口（27 号 §3.3）
 *
 * 复制微信文章/B站链接后打开观复（或从别处切回来），首页顶部提示“检测到链接，收进收集箱？”。
 * 读剪贴板需要权限；浏览器不给权限就完全静默，不弹任何错误。
 */
export function ClipboardBanner() {
  const { t } = useLang();
  const iconSet = useStore((s) => s.iconSet);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        // 只在安全上下文/有权限时可用；没有就跳过
        const text = await navigator.clipboard?.readText?.();
        if (!alive) return;
        const link = extractClipLink(text ?? "");
        if (!link || isClipLinkDismissed(link)) {
          setUrl(null);
          return;
        }
        setUrl(link);
      } catch {
        /* 权限拒绝/不支持：不打扰 */
      }
    };

    void check();
    const onFocus = () => void check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (!url) return null;

  const collect = () => {
    const link = url;
    setUrl(null);
    window.dispatchEvent(new CustomEvent("gf:open-clip-dialog", { detail: { url: link } }));
  };

  const dismiss = () => {
    dismissClipLink(url);
    setUrl(null);
  };

  return (
    <div className="clipbanner" data-testid="clip-banner" role="status">
      <span className="clipbanner__icon">
        <AppIcon name="inbox" set={iconSet} size={16} />
      </span>
      <div className="clipbanner__text">
        <b>{t("clipBannerTitle")}</b>
        <span title={url}>{url}</span>
      </div>
      <div className="clipbanner__actions">
        <button className="btn btn--sm" onClick={collect}>
          {t("clipBannerCollect")}
        </button>
        <button className="btn btn--sm" onClick={dismiss}>
          {t("clipBannerIgnore")}
        </button>
        <button className="icon-btn" title={t("clipBannerClose")} aria-label={t("clipBannerClose")} onClick={dismiss}>
          ×
        </button>
      </div>
    </div>
  );
}