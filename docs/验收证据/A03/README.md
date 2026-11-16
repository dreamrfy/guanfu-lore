# A03 验收证据 · 数据层 + 同步引擎

日期：2026-11-16 ｜ 执行：主会话（看门狗 11-15 21:38 停摆后换锁接管，见 `ops/锁/T-A03.lock`）
设备：Android 模拟器 `emulator-5554`（Android 14 / API 34 / pixel_6）
APK：`android-shell/app/build/outputs/apk/debug/app-debug.apk`（10:23 版）

## 交付内容

- **Room 数据层**：8 张表 1:1 复刻 web Dexie（`db/Entities.kt` + `db/Daos.kt` + `db/AppDatabase.kt`，库名 `guanfu.db`）
- **同步引擎**：`sync/SyncEngine.kt` 复刻 web `sync.ts` 五要点（游标推进 / 自回声防护 / coalesce / 乐观锁 applied·conflict / 附件补缺留给 A11）
- **协议层**：`sync/SyncApi.kt`（OkHttp + Dispatchers.IO）、`sync/SyncProtocol.kt`（DTO）、`sync/SyncStore.kt`（Room 实现 + 可注入接口）
- **调度**：`sync/SyncWorker.kt`（WorkManager 周期 15 分钟 + `enqueueNow` 即时推）
- **装配**：`SyncContainer.kt`（手工单例，baseUrl/token 每次从 Credentials 取，改设置即刻生效）

## 冒烟方式（为什么用本地契约服务端）

模拟器无外网出口（A02 实测 ping 8.8.8.8 全丢包），真云鉴权已由 A02 的
「hosts 劫持 + SSH 隧道」验证过。A03 要验的是**设备上 Room 写库与拉/推协议**，
所以用 `mock-sync-server.mjs`（严格按 `server/src/clipServer.ts` 四条语义实现）作为服务端，
把设置页服务地址指向 `http://10.0.2.2:8787`。A14 全流程自验再接真云。

## 冒烟结果（设备实测，非单测）

| 路径 | 触发 | 界面反馈 | 库内证据 |
| --- | --- | --- | --- |
| 拉取（upsert） | 点「立即同步（自检）」 | `同步完成（ok=true）：拉取 1 · 推送 0 · 冲突 0` | `pages` 有 `page-a03-smoke`，`docs` 有 136 字节块 JSON，`syncCursor=1`，`syncSeqs={page:page-a03-smoke:1}` |
| 游标增量 | 再点一次 | `拉取 0 · 推送 0 · 冲突 0` | `syncCursor` 保持 1，未重复写库 |
| 推送 applied | 预置 outbox 行后点同步 | `拉取 0 · 推送 1 · 冲突 1` | `outbox` 清空，`syncSeqs` 增 `page:page-a03-push=2` |
| 冲突副本 | 服务端对该条回 `conflict` | 同步完成，冲突计数 1 | `sync_conflicts` 有 `page-a03-conflict`（serverSeq=3，payload 原样存） |

- 证据文件：`01-模拟器-同步完成.png`、`02-模拟器-推送与冲突.png`、`mock-server.log.txt`、`mock-server-第一轮.log.txt`、`device-db-dump.txt`
  （`.log` 后缀被 .gitignore 忽略，故证据日志统一带 `.txt`）
- 库内取证命令：`adb exec-out run-as app.guanfu.shell cat databases/guanfu.db{, -wal}` 三件套拉回本机后用 sqlite 读取

## 冒烟逮到并修掉的真 bug（1 个）

**`SyncStore.applyPage` 把每次拉取的页面都误标软删**：原实现 `deletedAt = deletedAt ?: nowMs` 不分 op，
而 web 只在 `op === "delete"` 时兜底（`app/src/data/sync.ts:239-248`）。
后果：任何一次同步都会把远端页面扔进回收站。JVM 单测用 FakeStore 复刻语义，照不出「载荷 → Room 行」的映射错误。
修复：`applyPage` 增加 `op` 参数，只有 delete 才兜底。修复后设备实测 `pages.deletedAt = None`（见 dump）。

## 附带改动（验证需要，非产品功能）

- `MainActivity` 加「立即同步（自检）」按钮：WorkManager 的 `CONNECTED` 约束在无外网模拟器上永不满足
  （`dumpsys jobscheduler` 显示 `Ready: false`），需要一个确定性的设备端触发点。A04 有同步状态 UI 后可降级为隐藏入口。
- `src/debug/` 增加 network-security 配置，只对 `10.0.2.2/localhost/127.0.0.1` 放行明文 HTTP；release 包不含，线上仍强制 HTTPS。

## JVM 单测

`./gradlew testDebugUnitTest`：**32/32 全绿**（SyncEngineTest 9 + 剪藏/凭证/URL 既有 23）

## 仍未覆盖（不得当作已完成）

- **未接真云跑过 A03 的同步**（真云鉴权 A02 验过；A14 全流程自验时补）
- **附件补缺/补传**（`/api/sync/assets`）属 A11，本期引擎不拦主流程
- **WorkManager 后台调度未在真实网络下运行过**（模拟器无外网，约束永不满足；真机/主力机测时验证）
- **冲突解决 UI** 未做（A04+ 的冲突列表；本期只保证冲突不丢）
