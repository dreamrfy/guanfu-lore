# W120 收集箱页形态 · 验收证据

- 日期：2026-11-20
- 规格：`docs/复刻/09-模块7-收集箱与剪藏.md`（剪藏入库多维表的收集箱页）
- 实现：`app/src/shell/CollectionView.tsx`（剪藏库专用页签/搜索）、`app/src/data/clipInbox.ts`（状态归类/筛选/计数）
- 断言：`npm run clip-inbox-check` → **PASS**
- 截图：`收集箱页.png`

## 点验内容（真实浏览器）

| # | 断言 | 结果 |
| --- | --- | --- |
| 1 | 剪藏库页出现收集箱页签（全部 / 待整理 / 已归档 / 失败） | ✅ 4 个 |
| 2 | 角标计数：4 / 2 / 1 / 1 | ✅ |
| 3 | 待整理筛选 → 2 行 | ✅ |
| 4 | 待整理 + 搜索“B站” → 0 行 | ✅ |
| 5 | 清空搜索 → 回到 2 行 | ✅ |
| 6 | 已归档 → 1 行；失败 → 1 行 | ✅ |
| 7 | 全部 + 搜索“微信” → 2 行 | ✅ |
| 8 | 搜索无结果出现空态 | ✅ |
| 9 | 恢复全部后截图 | ✅ `收集箱页.png` |

## 顺手修掉的真问题

1. **W94 主页挡住表格**：`activeTabId === HOME_TAB` 时即使 `activeCollectionId` 已设置，主区仍渲染 AI 首页 → 收集箱/表格打不开。
   改为 `activeTabId === HOME_TAB && !activeCollectionId`（`app/src/shell/AppShell.tsx`）。
2. **从表格点回当前页签无效**：`openTab` 在 `activeTabId === id` 时提前 return，`activeCollectionId` 永远清不掉。
   改为仅在“没有打开表格”时才提前 return（`app/src/data/store.ts`）。

## 命令

```bash
cd app
npm run clip-inbox-check
npm test        # 37 files / 277 tests
npm run check   # 图标 + 令牌守卫 + tsc
npm run build
```
