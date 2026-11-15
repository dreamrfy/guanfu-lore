import { useEffect, useState } from "react";
import { findBacklinks, type Backlink } from "../data/backlinks";
import { useStore } from "../data/store";
import { useLang } from "../i18n";

/**
 * 正文底部的「引用了本页」条目。
 * 打字时不逐键扫库：docs 变化后等 400ms 再扫，停手才付出扫描成本。
 */
export function Backlinks({ pageId }: { pageId: string }) {
  const docs = useStore((s) => s.docs);
  const openTab = useStore((s) => s.openTab);
  const { t } = useLang();
  const [links, setLinks] = useState<Backlink[]>([]);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      void findBacklinks(pageId).then((found) => {
        if (alive) setLinks(found);
      });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pageId, docs]);

  if (links.length === 0) return null;

  return (
    <section className="backlinks">
      <div className="backlinks__title">
        {t("backlinksTitle")} <span className="backlinks__count">{links.length}</span>
      </div>
      {links.map((link) => (
        <button key={link.pageId} className="backlinks__item" onClick={() => openTab(link.pageId)}>
          <span className="backlinks__page">📄 {link.title}</span>
          {link.snippet && <span className="backlinks__snippet">{link.snippet}</span>}
        </button>
      ))}
    </section>
  );
}
