import { useEffect, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { findBacklinks, type Backlink } from "../data/backlinks";
import { flushDocs, useStore } from "../data/store";
import { useNavHistory } from "../data/navHistory";
import { useLang } from "../i18n";

/**
 * 页尾引用区（W29 手册 §2：常驻一行三段 — 引用当前页面 / 提及的页面引用 / 引用建议 Beta）。
 *
 *  - 「引用当前页面」：真实把本页的 pageMention 内联节点追加到正文末尾（落库后重挂载编辑器）。
 *  - 「提及的页面引用」：展开反链条目；打字时不逐键扫库，docs 变化后等 400ms 再扫。
 *  - 「引用建议 Beta」：观测未提供算法实现 → 【暂定】置灰，待专项。
 */
export function Backlinks({ pageId }: { pageId: string }) {
  const docs = useStore((s) => s.docs);
  const pages = useStore((s) => s.pages);
  const openTab = useStore((s) => s.openTab);
  const setBlocks = useStore((s) => s.setBlocks);
  const { t } = useLang();
  const [links, setLinks] = useState<Backlink[]>([]);
  const [open, setOpen] = useState(false);

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

  const title = pages.find((p) => p.id === pageId)?.title ?? "";

  /** 把「本页的提及」追加到正文末尾（真实写入，落库后重读） */
  const quoteSelf = async () => {
    const blocks = (docs[pageId] ?? []) as PartialBlock[];
    const block = {
      type: "paragraph",
      content: [{ type: "pageMention", props: { pageId, title } }],
    } as unknown as PartialBlock;
    setBlocks(pageId, [...blocks, block]);
    await flushDocs();
    await useNavHistory.getState().refreshTab(pageId);
  };

  return (
    <section className="pageref">
      <div className="pageref__row">
        <button className="pageref__seg" title="把本页引用插入到正文末尾" onClick={() => void quoteSelf()}>
          🔗 引用当前页面
        </button>
        <button
          className="pageref__seg"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          📄 提及的页面引用
          <span className="pageref__count">{links.length}</span>
        </button>
        <span className="pageref__seg pageref__seg--off" title="观测未提供算法，待专项（【暂定】）">
          ✨ 引用建议 Beta
        </span>
      </div>

      {open && (
        <div className="pageref__list">
          {links.length === 0 ? (
            <div className="pageref__empty">{t("backlinksNone")}</div>
          ) : (
            links.map((link) => (
              <button key={link.pageId} className="backlinks__item" onClick={() => openTab(link.pageId)}>
                <span className="backlinks__page">📄 {link.title}</span>
                {link.snippet && <span className="backlinks__snippet">{link.snippet}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}