/**
 * 日历视图（W75，04 §1.1 + 65 号观测）
 *
 * 形态：顶部「2026年11月 ⌄」+「‹ 今天 ›」；星期表头（一~日，周一起）+ 一条分隔线；
 *       日期格按周排（7 列），**今天红底圆标**，**跨月日期灰显**；有日期的记录在格子里列出。
 * 观测依据：ops/观测/android/65-视图-日历（weekday 行 7 列各 130px、线在表头下、
 *          跨月灰显、今天红圆标）。
 * 桌面端格子高度按容器自适应（桌面规格未取到，标【暂定】）。
 */
import { useMemo, useState } from "react";
import type { CollectionRow, RecordRow, ViewDef } from "../data/db";
import { asDateMs, asText } from "../data/collections";
import { useStore } from "../data/store";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/** yyyy-MM-dd（本地时区） */
function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CalendarView({
  collection,
  view,
  rows,
}: {
  collection: CollectionRow;
  view: ViewDef;
  rows: RecordRow[];
}) {
  const openRecord = useStore((s) => s.openRecord);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const dateField =
    collection.fields.find((f) => f.id === view.groupById && f.type === "date") ??
    collection.fields.find((f) => f.type === "date");

  const titleField = collection.fields.find((f) => f.type === "text");
  const titleOf = (rec: RecordRow) => {
    const t = titleField ? asText(rec.values[titleField.id]) : "";
    return t || "无标题记录";
  };

  // 记录按日期归堆
  const byDay = useMemo(() => {
    const m = new Map<string, RecordRow[]>();
    if (!dateField) return m;
    for (const rec of rows) {
      const ms = asDateMs(rec.values[dateField.id]);
      if (ms == null) continue;
      const k = dayKey(ms);
      const arr = m.get(k) ?? [];
      arr.push(rec);
      m.set(k, arr);
    }
    return m;
  }, [rows, dateField]);

  if (!dateField) {
    return (
      <div className="cal cal--empty">
        <p>日历需要先有一个「日期」字段作为日期依据。</p>
      </div>
    );
  }

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const firstDay = new Date(y, m, 1).getDay(); // 0=周日
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();
  // 一~日 打头（周一起）
  const offset = (firstDay + 6) % 7;

  // 格子：前面补上月尾部，后面补下月头部，凑满整周
  const cells: { key: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < offset; i++) {
    const d = daysInPrev - offset + 1 + i;
    const prev = new Date(y, m - 1, d);
    cells.push({ key: dayKey(prev.getTime()), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: dayKey(new Date(y, m, d).getTime()), day: d, inMonth: true });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length === 0) {
    const next = new Date(y, m + 1, nextDay++);
    cells.push({ key: dayKey(next.getTime()), day: next.getDate(), inMonth: false });
    if (cells.length > 42) break;
  }

  const todayK = dayKey(Date.now());
  const shift = (dir: number) => setCursor(new Date(y, m + dir, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  return (
    <div className="cal" data-view={view.id}>
      {/* 顶部一行 */}
      <div className="cal__head">
        <span className="cal__ym">{y}年{m + 1}月</span>
        <span className="cal__nav">
          <button className="cal__nav-btn" onClick={() => shift(-1)} title="上个月">
            ‹
          </button>
          <button className="cal__now" onClick={goToday}>
            今天
          </button>
          <button className="cal__nav-btn" onClick={() => shift(1)} title="下个月">
            ›
          </button>
        </span>
      </div>

      {/* 星期表头 */}
      <div className="cal__week">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal__wd">
            {w}
          </span>
        ))}
      </div>
      <div className="cal__line" />

      {/* 日期格 */}
      <div className="cal__grid">
        {cells.map((c) => {
          const items = byDay.get(c.key) ?? [];
          const isToday = c.key === todayK;
          return (
            <div key={c.key} className={`cal__cell${c.inMonth ? "" : " cal__cell--out"}`}>
              <span className={`cal__day${isToday ? " cal__day--today" : ""}`}>{c.day}</span>
              {items.map((rec) => (
                <span
                  key={rec.id}
                  className="cal__event"
                  title={titleOf(rec)}
                  onClick={() => openRecord(collection.id, rec.id)}
                >
                  {titleOf(rec)}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
