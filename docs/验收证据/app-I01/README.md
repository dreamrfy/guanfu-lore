# I01 剪藏箱自动入库证据（2026-11-15 · 看门狗 v4）

## 需求与实现

服务端剪藏箱内容自动 import 进本地「剪藏库」，不再依赖手动点导入；幂等。

- `app/src/data/clipBox.ts`：新增 `autoImportServerClips()`——拉清单 → 只取 `status === "complete"` 的条目（pending/partial 是抓取中的残缺文章，等下轮）→ `ensureClipCollection` + `ensureRecords`（判重读内存 records，开机后没人打开过剪藏库时必须先补进来）→ 逐条走既有 `importServerClip`（正文 + 图片代理下载 + 快照改写落附件库，按原链判重）。
- `app/src/data/store.ts`：两个触发点，都汇入模块级 `maybeAutoImportClips()`（5 分钟节流 + busy 防重入；动态 import clipBox 避免静态循环依赖）：
  1. `hydrate` 末尾——开机收一次；
  2. `runSyncNow` 成功后——自动同步空闲节奏 1 分钟一轮，节流后实际 5 分钟核对一次，与服务器每 5 分钟收一批的节奏对齐。
- 服务器不可达时 `fetchServerClipIndex` 静默返回空，不影响页面同步等其他功能。

## 测试（app/src/data/clipBoxAuto.test.ts，走真实 store + fake-indexeddb，仅 fetch 按路由打桩）

1. complete 条目自动导入：记录落「剪藏库」（标题/原链/作者/未读），图片走代理落附件库（image/png 4B），快照改写后落附件库且引用 asset://，partial 条目未拉详情。
2. 幂等：再跑一遍 imported=0，记录数与附件数不变。
3. 只剩 partial 条目：checked=0，不建「剪藏库」表。
4. 服务器不可达：安静返回 0，不抛错。

全套件 213/213 绿（含本轮新增 4 例）；tsc --noEmit 干净。

## 与手动导入的关系

剪藏箱页面的清单和「导入」按钮保留，兜底处理 partial/失败等未自动导入的条目（I02 未读/已读 UI 在此之上继续）。
