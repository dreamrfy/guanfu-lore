/**
 * 时间轴视图（W74，04 §1.1 + 49/64 号观测）
 *
 * 形态（照 64 号观测树）：
 *   ① 顶部一行：`2026年11月`（左）+ `月 ⌄`（单位下拉）+ `‹` + `今天` + `›`
 *   ② 日期刻度条（横向）：每天一个刻度，**今天**用红底圆标 + 一条红色竖线往下贯穿
 *   ③ 左侧记录列表面板（可折叠，折叠钮 `≪`），右侧时间轴泳道按日期摆记录块
 *   ④ 时间轴上的记录块用颜色条表示一条记录，块宽 = 该记录跨越的时长（暂按单日）
 *
 * 时间轴依据的日期字段：优先 view.groupById 指向的日期字段，否则取第一个日期字段；
 *   都没有 → 引导（先去建一个日期属性）。
 * 单位下拉：月 / 周 / 日（按观测只取了「月」，其余两项是同一套刻度换算，标【暂定】）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CollectionRow, RecordRow, ViewDef } from "../data/db";
import { asDateMs, asText } from "../data/collections";
import { useStore } from "../data/store";
import { AppIcon } from "../design/icons";

type Unit = "month" | "week" | "day";

const UNIT_LABEL: Record<Unit, string> = { month: "月", week: "周", day: "日" };

/** yyyy-MM-dd —— 用本地时区，日期格子的比较基准 */
function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 该月的天数 */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

export function TimelineView({
  collection,
  view,
  rows,
}: {
  collection: CollectionRow;
  view: ViewDef;
  rows: RecordRow[];
}) {
  const openRecord = useStore((s) => s.openRecord);
  const iconSet = useStore((s) => s.iconSet);

  const [unit, setUnit] = useState<Unit>("month");
  const [unitOpen, setUnitOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const laneWrapRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // 时间轴用的日期字段
  const dateField =
    collection.fields.find((f) => f.id === view.groupById && f.type === "date") ??
    collection.fields.find((f) => f.type === "date");

  const titleField = collection.fields.find((f) => f.type === "text");
  const titleOf = (rec: RecordRow) => {
    const t = titleField ? asText(rec.values[titleField.id]) : "";
    return t || "无标题记录";
  };

  // 该视图周期内的刻度（按单位：月=整月日���，周=7 天，日=1 天）
  const ticks = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    if (unit === "month") {
      const n = daysInMonth(y, m);
      return Array.from({ length: n }, (_, i) => new Date(y, m, i + 1).getTime());
    }
    if (unit === "week") {
      const start = cursor.getTime();
      return Array.from({ length: 7 }, (_, i) => start + i * 86400000);
    }
    return [cursor.getTime()];
  }, [cursor, unit]);

  const tickKeys = useMemo(() => ticks.map(dayKey), [ticks]);
  const todayKey = dayKey(Date.now());

  // 记录 → 落在哪个刻度
  const placed = useMemo(() => {
    if (!dateField) return [];
    const idx = new Map<string, number>();
    tickKeys.forEach((k, i) => idx.set(k, i));
    return rows
      .map((rec) => {
        const ms = asDateMs(rec.values[dateField.id]);
        if (ms == null) return null;
        const i = idx.get(dayKey(ms));
        if (i === undefined) return null;
        return { rec, tick: i, ms };
      })
      .filter((x): x is { rec: RecordRow; tick: number; ms: number } => x !== null);
  }, [rows, dateField, tickKeys]);

  if (!dateField) {
    return (
      <div className="timeline timeline--empty">
        <p>时间轴需要先有一个「日期」字段作为时间依据。</p>
      </div>
    );
  }

  const shift = (dir: number) => {
    if (unit === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else if (unit === "week") setCursor(new Date(cursor.getTime() + dir * 7 * 86400000));
    else setCursor(new Date(cursor.getTime() + dir * 86400000));
  };

  const goToday = () => {
    const n = new Date();
    setCursor(unit === "month" ? new Date(n.getFullYear(), n.getMonth(), 1) : new Date(n.getFullYear(), n.getMonth(), n.getDate()));
  };

  const periodLabel =
    unit === "month"
      ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
      : unit === "week"
        ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月${cursor.getDate()}日`
        : `${cursor.getFullYear()}年${cursor.getMonth() + 1}月${cursor.getDate()}日`;

  // 每条刻度上的记录（可能多条）
  const byTick = new Map<number, typeof placed>();
  for (const p of placed) {
    const arr = byTick.get(p.tick) ?? [];
    arr.push(p);
    byTick.set(p.tick, arr);
  }

  const todayIdx = tickKeys.indexOf(todayKey);

  // 打开时把「今天」滚到视野中间（观测里默认就停在今天）
  useEffect(() => {
    const el = laneWrapRef.current;
    if (!el) return;
    const idx = tickKeys.indexOf(todayKey);
    if (idx < 0) return;
    const tickW = 56; // 与 --timeline-tick-w 一致
    el.scrollLeft = Math.max(0, idx * tickW - el.clientWidth / 2 + tickW / 2);
  }, [tickKeys, todayKey]);

  return (
    <div className="timeline" data-view={view.id}>
      {/* ① 顶部一行 */}
      <div className="timeline__head">
        <span className="timeline__date">{periodLabel}</span>
        <span className="timeline__head-right">
          <span className="timeline__unit-wrap">
            <button className="timeline__unit" onClick={() => setUnitOpen((v) => !v)}>
              {UNIT_LABEL[unit]} <AppIcon name="chevronDown" set={iconSet} size={12} />
            </button>
            {unitOpen && (
              <div className="popover timeline__unit-pop">
                {(Object.keys(UNIT_LABEL) as Unit[]).map((u) => (
                  <button
                    key={u}
                    className="menu-item"
                    onClick={() => {
                      setUnit(u);
                      setUnitOpen(false);
                    }}
                  >
                    {UNIT_LABEL[u]}
                  </button>
                ))}
              </div>
            )}
          </span>
          <button className="timeline__nav" onClick={() => shift(-1)} title="上一个">
            ‹
          </button>
          <button className="timeline__now" onClick={goToday}>
            今天
          </button>
          <button className="timeline__nav" onClick={() => shift(1)} title="下一个">
            ›
          </button>
        </span>
      </div>

      {/* 左侧记录列表面板 + 右侧泳道 */}
      <div className="timeline__body">
        <aside className={`timeline__panel${panelOpen ? "" : " timeline__panel--closed"}`}>
          <button
            className="timeline__collapse"
            onClick={() => setPanelOpen((v) => !v)}
            title={panelOpen ? "折叠记录列表" : "展开记录列表"}
          >
            {panelOpen ? "≪" : "≫"}
          </button>
          {panelOpen && (
            <div className="timeline__panel-list">
              {rows.map((rec) => (
                <div key={rec.id} className="timeline__panel-row" onClick={() => openRecord(collection.id, rec.id)}>
                  <span className="timeline__panel-title">{titleOf(rec)}</span>
                </div>
              ))}
              {rows.length === 0 && <p className="timeline__panel-empty">无记录</p>}
            </div>
          )}
        </aside>

        <div className="timeline__lane-wrap" ref={laneWrapRef}>
          {/* ② 日期刻度条 */}
          <div className="timeline__ruler">
            {ticks.map((t, i) => {
              const d = new Date(t);
              const isToday = tickKeys[i] === todayKey;
              return (
                <div key={i} className={`timeline__tick${isToday ? " timeline__tick--today" : ""}`}>
                  <span className="timeline__tick-label">{d.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* ③ 泳道：记录块 */}
          <div className="timeline__lane">
            {/* 今天红线：从刻度条一直贯穿到泳道底部 */}
            {todayIdx >= 0 && (
              <div
                className="timeline__now-line"
                style={{ left: `calc(${todayIdx} * var(--timeline-tick-w) + var(--timeline-tick-w) / 2)` }}
              />
            )}
            {ticks.map((_, i) => {
              const items = byTick.get(i) ?? [];
              return (
                <div key={i} className="timeline__col">
                  {items.map((p) => (
                    <div
                      key={p.rec.id}
                      className="timeline__block"
                      onClick={() => openRecord(collection.id, p.rec.id)}
                      title={titleOf(p.rec)}
                    >
                      <span className="timeline__block-title">{titleOf(p.rec)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            {placed.length === 0 && (
              <p className="timeline__lane-empty">该时间段内没有带日期的记录</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
