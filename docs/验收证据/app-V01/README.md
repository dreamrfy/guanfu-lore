# V01 模块 V 自验证据（2026-11-15 · 分组视图）

## 需求

分组视图（V01）：按某字段分组展示（组头+计数）；与筛选/排序共存；单测。

## 实现

- **数据层**（`app/src/data/collections.ts`）：`groupRecords(records, field)` —— 纯展示层分桶。筛选、排序照旧先在 `applyView` 里生效，分组只把结果切桶；组内保持传入顺序（= 排序结果）。组间顺序：单选/多选按选项序、勾选框已勾在前、文本按中文序，（空）永远垫底。多选一条记录可进多个组（Notion 语义）。老数据 select 存名字而非 id 的兜底也处理了。
- **视图定义**（`app/src/data/db.ts`）：`ViewDef.groupById?: string | null`，缺省 = 不分组，老数据无此字段天然兼容。
- **UI**（`ViewBar.tsx` + `CollectionView.tsx`）：ViewBar 新增「分组」按钮 + GroupPanel（不分组/按「字段」分组）；表格渲染组头行（`grid__group`：组名 + 计数徽标），行号在组内重新计。
- **单测**（`app/src/data/groupView.test.ts`，5/5）：select 选项序+（空）垫底+空组不出现；多选跨组；checkbox 已勾在前；text 中文序；applyView 筛选先于分组的共存；组内保序。**全套件 241/241 绿**。

## 走查方式（真浏览器、真 IndexedDB，无 mock）

`v01-walkthrough.mjs`（playwright-core 连 Chrome for Testing 9223，vite 5173）：

1. **新建表格**：新表自带「标题」文本列 +「状态」单选列（未开始/进行中/已完成）。
2. **造数据**：＋新建记录 ×4，前三行状态分别设 未开始/进行中/已完成，末行留空。
3. **分组**：ViewBar「分组」→ 按「状态」分组 → 组头+计数 `未开始1 / 进行中1 / 已完成1 / （空）1`，（空）垫底；ViewBar 按钮高亮「分组 · 状态」。
4. **切回**：面板点「不分组」→ 组头消失、行恢复全局序。

只读断言全部通过（脚本输出）：

```
[v01] ✓ 新表已打开 ｜ name=新建表格
[v01] ✓ 4 条记录就绪 ｜ rows=4
[v01] ✓ 状态列已填 ｜ cells=["未开始","进行中","已完成",""]
[v01] ✓ 组头+计数 ｜ headers=["未开始1","进行中1","已完成1","（空）1"]
[v01] ✓ （空）垫底 ｜ last=（空）1
[v01] ✓ 切回不分组：组头消失 ｜ groups=0
[v01] ✓ 行恢复 4 条 ｜ rows=4
```

## 截图（shots/）

| 文件 | 内容 |
| --- | --- |
| 1-数据就绪未分组.png | 4 条记录平铺，状态列 前三行已填 |
| 2-按状态分组.png | 分组面板打开（按「状态」已勾）+ 组头「已完成①」「（空）①」可见；ViewBar 显示「分组 · 状态」 |
| 3-切回不分组.png | 组头消失，恢复平铺 |

## 单测逮不到、真机逮到的回归（2 个）

1. **useMemo 放在提前 return 之后**（本次开发引入）：`collection` 未加载时组件提前 return，`useMemo` 不执行；等 collection 一到，React 报 "Rendered more hooks than during the previous render" 直接崩——首屏必经路径。修法：把分组相关的 `useMemo` 挪到提前 return 之前，`groupField` 用可选链取。**与 M03 的 TagBar 教训同款**：hook 只能出现在组件顶部，任何"加载中先 return"的组件都要过一遍真机首屏。
2. **下拉/复选框提交后编辑态不收起**（存量 bug）：注释写着「复选框/下拉不需要一直开着编辑态」，但条件只覆盖了文本类字段——select/checkbox/date 提交后编辑器一直挂着，要点别处才收。修法：除 multiSelect（要连着勾多个）外提交即收 `setEditingCell(null)`。

## 环境

- 与 M03/H04 同一套：Chrome for Testing（`E:/dev/tmp/cft/chrome-win64/chrome.exe`）+ vite 5173 + 真 IndexedDB，无 mock。走查脚本：`E:/dev/tools/flowus-cap/v01-walkthrough.mjs`。
