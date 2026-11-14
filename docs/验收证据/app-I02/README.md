# I02 未读/已读 UI 证据（2026-11-15 · 看门狗 v4）

## 实现面

- 判定纯函数（`app/src/data/clipBox.ts`）：`clipReadState`（按字段名「状态」+ 选项名「未读/已读」定位，缺一返回 null → 不参与未读逻辑）、`isClipUnread`、`unreadClipCount`。手动剪藏（clipIngest）和自动入库（I01）建的表用同一套字段名，所以两条来源的记录都吃这套机制。
- 收集箱列表（`CollectionView.tsx`）：未读行行号位置显示蓝色圆点（`.unread-dot`）；点开记录（220ms 单击延迟回调，与双击编辑互不干扰）时顺手把「状态」改为已读——走既有 `setCell`，落库 + 进同步队列，多端会同步已读状态。
- 侧栏入口（`Sidebar.tsx`）：有未读机制的表格名旁显示未读数角标（`.sidebar__badge`，超 99 显示 99+）。侧栏挂载时对这类表提前 `ensureRecords` 补进内存，自动导入新剪藏后角标实时刷新。
- 样式：`index.css` 新增 `.sidebar__badge` / `.unread-dot`，用既有 `--primary` 变量，深浅色主题都适配。

## 测试（clipBoxAuto.test.ts 追加 3 例，全套件 216/216 绿）

1. `clipReadState`：正常定位 / 缺字段 null / 缺「已读」选项 null / 无表 null。
2. `isClipUnread` / `unreadClipCount`：仅状态=未读算未读；计数正确；records 未加载按 0。
3. 端到端：自动导入的记录默认未读 → `setCell` 标已读 → 内存与落库都变已读、侧栏计数归零。

全链截图证据（剪藏→自动出现在未读→点开标已读→角标变化）在 `docs/验收证据/app-I03/`（I03 自验任务产出）。
