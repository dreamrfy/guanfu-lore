# P1-T02 本机数据库（2026-11-07，**已验收关包**）

> 验收标准（任务表）：新建一条内容重启后还在；看 AI 演示一次迁移和回滚。
> **结论：用户回「可以关包了」。三端持久化 + 迁移回滚演示全部通过；验收中发现的两个网页端问题当场修复。**

## 交付物

| 文件 | 职责 |
| --- | --- |
| `client/lib/data/pages_table.dart` | 数据模型 v1：Pages 表（稳定 ID/父子/标题/正文/软删除/时间 + **T07 同步预埋字段 rev/baseRev/updatedBy**） |
| `client/lib/data/database.dart` | drift 数据库（三端同一套代码）：WAL+NORMAL+外键、迁移骨架、迁移前自动备份 `backupDbFile()` |
| `client/lib/data/ids.dart` | 26 位 ULID 稳定身份生成器（Crockford Base32，不依赖标题与路径——需求 §4.1） |
| `client/lib/data/migration_demo*.dart` | 迁移/回滚演示（独立演示库：v1 建库写 2 条→备份→加列升 v2→校验；回滚=备份恢复→校验版本号与数据） |
| `client/web/sqlite3.wasm` + `drift_worker.js` | 网页端 SQLite 引擎（731KB+355KB，镜像下载，版本与 drift 2.31.0/sqlite3 2.9.4 配套） |
| `client/test/database_test.dart` | 4 个单元测试（ID 唯一性/往返/重命名/软删除） |

## 验证记录（AI 侧实测）

| 项 | 结果 |
| --- | --- |
| `flutter analyze` | **No issues found**（0 错 0 警） |
| `flutter test` | **4/4 通过**（Windows 宿主机用 winsqlite3.dll 兼容层） |
| 安卓持久化 | ✅ UI 新建「hello-p1t02」→ `am force-stop` 杀进程 → 重开 → **原样还在**（截图①②） |
| 迁移/回滚演示 | ✅ 演示库实测：升级加列数据完整 ✅、回滚后版本号与 2 条数据完好 ✅（截图③） |
| Windows | `flutter build windows --release` 成功（首次因系统内存耗尽 OOM 失败，停掉 Gradle 驻留进程释放 6GB 后通过） |
| Web | 构建成功；本地服务（验收时 5176） |

## 过程坑（沉淀）

- **Flutter Windows 插件需要「开发人员模式」**（符号链接权限）：`flutter pub get` 直接报错提示；AI 提权写注册表被拒（HKLM 需管理员），由用户在设置里打开后通过
- **并发构建内存挤压（用户当场立规）**：Gradle 守护进程 + 模拟器 + 浏览器同跑时，Dart AOT 编译进程 OOM（`zone.cc Out of memory` → MSB8066），连带崩掉网页服务与模拟器。对策（已入全局记忆）：构建前 `gradlew --stop`，**构建一律串行，一次只跑一个重活**
- **网页灰屏（DriftWebOptions）**：`driftDatabase()` 编译到 web 时必须传 `web: DriftWebOptions(sqlite3Wasm:, driftWorker:)`，否则 ArgumentError → release 下整屏灰。修复后控制台 0 错
- **网页缺字（tofu）**：引擎按需拉字体分片，验收时用户名字里的生僻字落在未下载分片。**终版修法：按引擎命名规律（`<hash>.<N>.woff2`，前缀取自 serve 日志的真实请求）探测式补全简/繁/港/日四族全部分片——425 个文件共 12MB 进 `web/fonts.gstatic/`**；此前只搬原型用过的 37 个不够
- **Git Bash 吃 `$var`/`$_`**：双引号内 PowerShell 变量会被 bash 展开 → 一律写 .ps1 脚本文件执行
- sqlite3.wasm/drift_worker.js 下载：GitHub 直连不通，`ghfast.top` 镜像一次成功

## 已知边界

- 迁移/回滚演示按钮在网页端隐藏（无本地文件系统；真实迁移仍由 drift 正常执行）
- 单元测试跑在内存库上；真实文件库的迁移演练由演示按钮承担（升级前自动备份）
- Web 端数据库走浏览器 OPFS/IndexedDB，**受浏览器清理策略影响**（OFF-05 口径，安卓/Windows 才是可靠离线）
