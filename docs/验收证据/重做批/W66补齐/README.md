# W66 冻结列补齐 · 验收证据

- 日期：2026-11-22（DONE·部分 → DONE）
- 当年结论：「Edge 157 实测 td 横向 sticky 无法固定（th 可以），累计 left 偏移 + z-index 仍位移 103px」→ 诚实置灰。
- 本次复查：`border-collapse` 本来就是 `separate`（不是 collapse 的经典坑）；问题出在**旧实现的坐标/置灰**而非浏览器不支持——代码里 `frozenLeft` 累计偏移、CSS 硬编码 `left:48px`（No. 列实宽 66px）与置灰菜单共存，从未真正启用。

## 实现

- `ColumnMenu`：置灰项 → 真实「冻结列 / 取消冻结列」，作用于**当前视图**（`updateView(collectionId, viewId, { frozenFieldIds })`，走同步队列持久化）；菜单项文案随状态切换。
- 冻结计算改用当前视图的 `frozenFieldIds`（原硬取 `views[0]`）；`ViewDef.frozenFieldIds` 数据层早已备好，本次接通渲染。
- 清理 CSS 陈旧硬编码 `left: 48px`（改由组件内联累计偏移）；首列恒冻结按规格保留。

## 点验（`npm run freeze-check`，真实浏览器）

| # | 断言 | 结果 |
| --- | --- | --- |
| 1 | 列头菜单冻结第二列（状态单选） | ✅ |
| 2 | 横向滚到最右：冻结单元格相对滚动容器 left = 66px 恒定（滚动前/后一致，0 位移） | ✅ |
| 3 | `frozenFieldIds` 持久化进视图 | ✅ |
| 4 | 解冻后 sticky 单元格数 6 → 3（每行只剩恒冻结首列） | ✅ |

截图：`冻结-滚动中.png`、`解冻-滚动中.png`。

## 命令

```bash
cd app
npm run freeze-check
npm test        # 40 files / 292 tests
npm run check && npm run build
```
