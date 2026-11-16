# A06 验收证据 · 块编辑器一期

日期：2026-11-16 ｜ 执行：主会话 ｜ 设备：模拟器 `emulator-5554`（Android 14 / API 34）
APK：`android-shell/app/build/outputs/apk/debug/app-debug.apk`（12:0x 版）

## 交付内容

- **`ui/DocEditor.kt`**（纯 Kotlin，可单测）：**在原始块 JSON 上原地编辑**
  - `setText`：改文字；原块是「单个纯文本 run」时保留其 styles（整块行内代码改字后仍是代码）
  - `setKind`：切换 正文/标题 1-3/无序/有序/待办/引用/代码/分割线，正文与 children 不丢
  - `toggleCheck`、`insertAfter`、`append`、`delete`
  - **不可编辑的块**：多段行内样式、链接、页面提及、图片/表格/书签/多维表、未知块型——
    返回不可编辑并给出原因（不让「编辑一次就把加粗/链接改没」的静默数据丢失发生）
  - 未碰过的块与未知字段**逐字节保留**（`futureKey`、嵌套 props、children 原样）
- **`ui/PageEditor.kt`**（Compose）：每块一个输入框 + 类型菜单 + 勾选框 + 「+」插入 + 「✕」删除；
  改动后 400ms 防抖保存，「完成」退出前强制落一次盘（防抖未到也不丢）
- **`ui/PageSaver.kt`**：对齐 web `store.setBlocks`（store.ts:972-984）——
  写 docs、刷新 page.updatedAt、出同步箱 `page` upsert，payload 形状 = `{page: PageRow, blocks: [...]}`（字段名与 web 一致）
- **键盘适配**：Manifest `windowSoftInputMode="adjustResize"` + Compose `imePadding()`
- **页面详情**：右上「编辑」进入编辑态；「完成」回到只读并刷新列表/详情

## 冒烟方式

沿用本地契约服务端（`docs/验收证据/A03/mock-sync-server.mjs`，模拟器设置页仍指向 `http://10.0.2.2:8787`），
这样不仅验「写库」，还能验「推上服务器的 payload 长什么样」。

## 冒烟结果（设备实测）

| 步骤 | 操作 | 结果 | 证据 |
| --- | --- | --- | --- |
| 进入编辑 | 打开「会议记录」→ 点「编辑」 | 每块出现类型按钮/输入框/「+」「✕」 | `01-编辑模式.png` |
| 改文字 | 在正文块输入 `A06EDIT` | 输入即时生效（键盘弹出时该行不被遮住，`mInputShown=true`） | `01`、`04-键盘弹出-光标行不被遮挡.png` |
| 增块 | 点块下「+」，输入 `NewBlockA06` | 新块插在该块之后并获得焦点 | `01` |
| 类型切换 | 新块左侧「¶」→ 选「☑ 待办」 | 变成待办块（☐） | `02-改类型为待办.png` |
| 自动保存 | 点「完成」 | 查看器立刻显示改后文字与待办块；页面 updatedAt 更新 | `03-保存后查看器与同步完成.png` |
| 出同步箱 + 推送 | 点顶部「同步」 | 界面：`同步完成：拉取 0 · 推送 1 · 冲突 0`；mock 收到 `POST /api/sync/push`，payload 里 `page` 字段与 web PageRow 同形、`blocks` 含改后内容；服务端回 applied seq=2 | `03` + mock 日志 |
| 库内取证 | 拉 Room 库检查 | docs 含 `A06EDIT`/`NewBlockA06`/`checkListItem`；outbox 清空；`syncSeqs` 记 `page:p-child-2=2`；page.updatedAt 已变 | 见下方命令 |

库内取证命令：

```
adb exec-out run-as app.guanfu.shell cat databases/guanfu.db{,-wal,-shm} 三件套拉回本机 → sqlite 读取
```

## JVM 单测

`./gradlew testDebugUnitTest`：**71/71 全绿**
（新增 `DocEditorTest` 12 条：改字保留样式/拒改富文本·链接·提及/切类型保留正文/勾选翻转/
插块与追加位置/删块/未知块字段与 children 原样/坏 JSON 可继续编辑/分割线只读）

## 附带修复

`ClipRealServiceTest` 对真实服务的两条契约测试：原来网络不通时会报「测试失败」，
现在先做 3 秒 TCP 可达性预检，不可达则 `assumeTrue` 跳过（环境问题不该冒充代码回归）。
本次运行环境可达，两条测试真实跑过并通过。

## 仍未覆盖（不得当作已完成）

- **富行内编辑**（加粗/斜体/链接/页面提及）：这类块在编辑器里只读并提示「A07 接入」
- **`/` 命令面板、拖拽排序**：A07
- **子块（children）编辑**：A07；本期父块正文可改，children 原样保留
- **表格/图片/书签/多维表块编辑**：A08/A11
- **新建页面 / 改名 / 回收站恢复**：A10 及后续
- 真机软键盘与中文输入法实测：A14/A15（模拟器只验了英文输入与 IME 弹出）
