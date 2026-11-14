# S04 端到端自验证据（2026-11-15 · 看门狗 v4）

## 场景

两份本地库互传页面（S01 部署被拦，按任务表允许的「两份本地库」模式执行）：

- 服务端：本机起 `server/src/clipServer.ts`（127.0.0.1:8787，KF_DATA_DIR/KF_ASSETS_DIR 指向 out/s04/，未配 R2 → 本地盘模式，未配 CLIP_TOKEN → 本机自用）
- A 库：`localhost:5173`（vite dev）
- B 库：`localhost:5174`（vite dev，与 A 不同 origin → IndexedDB 完全独立）

## 链路实录

1. A 库新建页面「同步自验页」，正文打字，BlockNote 编辑器粘贴 128×128 PNG（385B，`server/out/s04/make-image.mjs` 生成）→ 走真实 uploadFile 链落本地 assets 表。
2. A 库点「立即同步」→ 「同步完成：拉取 1 条、推送 1 条」；服务端 `out/s04/assets/ce0608ea-03be-42c0-a969-2bde7836abb6.png`（385B）落盘 = S02 上传成功。
3. B 库点「立即同步」→ 「拉取 1 条、推送 0 条」；B 的 IndexedDB assets 表出现同 id 字节（385B，image/png）= S03 补缺图成功。
4. B 库打开页面：标题「同步自验页」+ 正文 + 图片渲染 128x128（`b库-还原页面.jpg` 截图）；A 库同画面（`a库-源页面.jpg`）。
5. 服务端变更流水全称见 `服务端变更流水-修复前.json`（seq 1~3）+ 本说明 seq 4~13 描述。

## 端到端逮到并修复的 3 个真 bug

1. **setBlocks 同步 payload 泄漏 blob: 地址**（store.ts）：入队的页面 payload 用内存 blocks（blob: 地址），落库走 writeDoc（有 unresolve）但同步 payload 没有 → 其他设备收到本会话才有效的 blob 地址（破图），附件永远传不出去。修复：入队前 `unresolveAssetRefs(blocks)`。回归测试在 assetSync.test.ts。
2. **自回声覆盖本地未推送改动**（sync.ts runSync）：自动同步拉到**自己早前推的旧快照**，applyRemoteChange 无脑覆盖内存与库，把刚改的标题打回 ""（服务端流水 seq 2 → seq 3 标题丢失实录）。修复：本地 outbox 仍有 pending 的行跳过远端应用（seq 照常推进），推送时乐观锁处理竞争。回归测试在 assetSync.test.ts。
3. **拉来的页面进内存未解析 asset://**（store.ts applyRemoteChange）：远端 payload 直接写 docs 内存，先拉到页面后打开时编辑器 img src 是 asset:// 字面量（破图）。修复：写入内存前 `resolveAssetRefs`。

附带：`duplicatePage` / `createPageWithBlocks` 建的新页面原来不入队同步，已补 enqueue。

## 测试

- app 全套件 209/209 绿（含本轮新增回归 2 例）；tsc --noEmit 干净。
