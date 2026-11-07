import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "p0t2-note";
const ROWS = 1000;
const COLS = 8;

interface Cell {
  id: number;
  名称: string;
  来源: string;
  标签: string;
  状态: string;
  日期: string;
  字数: number;
  备注: string;
  链接: string;
}

function makeRows(): Cell[] {
  return Array.from({ length: ROWS }, (_, i) => ({
    id: i + 1,
    名称: `测试文章标题第${i + 1}行——这是一段用于撑宽列的中文文本`,
    来源: ["公众号", "B站", "小红书", "抖音"][i % 4],
    标签: `标签${i % 17}/${i % 23}`,
    状态: ["已读", "未读", "稍后读"][i % 3],
    日期: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
    字数: 800 + ((i * 37) % 4200),
    备注: i % 5 === 0 ? "含代码块与表格" : "—",
    链接: `https://example.com/a/${i + 1}`,
  }));
}

export default function App() {
  const [note, setNote] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  // 离线读写：启动时从 localStorage 恢复
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        setNote(obj.text ?? "");
        setSavedAt(obj.savedAt ?? null);
      } catch {
        /* 忽略损坏数据 */
      }
    }
  }, []);

  const saveNote = () => {
    const savedAt = new Date().toLocaleString("zh-CN");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: note, savedAt }));
    setSavedAt(savedAt);
  };

  // 1000 行表格渲染耗时（无虚拟滚动，两侧同等最差条件）
  const rows = useMemo(makeRows, []);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  useEffect(() => {
    const t0 = performance.now();
    requestAnimationFrame(() => setRenderMs(performance.now() - t0));
  }, [rows]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: "0 0 8px" }}>P0-T02 React 原型（Vite + React 18）</h2>

      <section style={box}>
        <h3>① 中文输入</h3>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="在这里连续输入中文，观察候选框跟随与卡顿"
          style={{ width: "100%", padding: 8, fontSize: 16 }}
        />
        <div style={{ color: "#5c6670", marginTop: 4 }}>已输入 {typed.length} 字</div>
      </section>

      <section style={box}>
        <h3>② 离线读写（localStorage）</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="写点内容再点保存，然后刷新页面看内容是否还在"
          rows={3}
          style={{ width: "100%", padding: 8, fontSize: 14 }}
        />
        <button onClick={saveNote} style={{ padding: "6px 16px" }}>保存到本机</button>
        <div style={{ color: "#5c6670", marginTop: 4 }}>
          {savedAt ? `上次保存于：${savedAt}` : "本机还没有存档"}
        </div>
      </section>

      <section style={box}>
        <h3>③ 1000 行 × 8 列表格（无虚拟滚动）</h3>
        <div style={{ color: "#5c6670", marginBottom: 6 }}>
          首次渲染耗时：{renderMs == null ? "统计中…" : `${renderMs.toFixed(0)} ms`}，请上下快速滚动观察是否掉帧
        </div>
        <div style={{ height: 420, overflow: "auto", border: "1px solid #d0d7de" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f6f8fa", position: "sticky", top: 0 }}>
                {["#", "名称", "来源", "标签", "状态", "日期", "字数", "备注", "链接"].map((h) => (
                  <th key={h} style={{ ...td, fontWeight: 600, background: "#f6f8fa" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.id}</td>
                  <td style={td}>{r.名称}</td>
                  <td style={td}>{r.来源}</td>
                  <td style={td}>{r.标签}</td>
                  <td style={td}>{r.状态}</td>
                  <td style={td}>{r.日期}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.字数}</td>
                  <td style={td}>{r.备注}</td>
                  <td style={{ ...td, color: "#1d4ed8" }}>{r.链接}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const box: React.CSSProperties = {
  marginBottom: 20,
  padding: 12,
  border: "1px solid #d0d7de",
  borderRadius: 8,
};

const td: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  padding: "4px 8px",
  whiteSpace: "nowrap",
  textAlign: "left",
};
