# P1-T03 文件与资源存储（2026-11-07，**已验收关包**）

> 验收标准（任务表）：放一张图进页面，关掉重开仍在；把原图删掉后应用里还能看。
> **结论：用户回「通过」。安卓全流程 AI 实测，Windows/Web 交用户验收通过。**

## 交付物

| 文件 | 职责 |
| --- | --- |
| `client/lib/data/assets_table.dart` | 资源台账 Assets（编号/完整哈希/大小/扩展名）+ 页面挂载 PageAssets + 网页端字节仓 WebAssetBlobs |
| `client/lib/data/asset_store_common.dart` | 接口与共享逻辑：扩展名白名单（png/jpg/jpeg/gif/webp，与服务端 images.ts 同口径）、SHA-256 编号 |
| `client/lib/data/asset_store_io.dart` | 原生实现：`assets/<前2位>/<编号>.<ext>` 两级分片 + 临时文件原子写入 |
| `client/lib/data/asset_store_web.dart` | 网页实现：字节存数据库（OPFS/IndexedDB 上的 drift 表） |
| `client/lib/main.dart` | 笔记详情页：添加图片（file_picker 13）→ 指纹编号入库 → 缩略图 + 完整性校验展示 |
| `client/test/database_test.dart` | 10 个测试（原 4 + 资源 6：路径规则/往返/篡改检测/去重/白名单/台账挂载幂等） |

## 关键设计（G1 客户端落地）

- **编号 = SHA-256 前 16 位**，与服务端 assetId 同规格；数据库不存任何来源 URL/路径
- **内容定编号 → 天然去重**：同内容只存一份
- **完整性校验**：展示时重算哈希与台账比对，不符标红（防篡改/防半文件）
- 原子写入（临时名+rename），断电不留半个文件

## 验证记录

| 项 | 结果 |
| --- | --- |
| `flutter analyze` | 0 问题 |
| `flutter test` | **10/10 通过** |
| 安卓 v1→v2 真迁移 | ✅ 升级安装后既有数据（含用户实测输入）原样在（截图 `安卓v1到v2真迁移后数据完好.png`） |
| 安卓挂图 | ✅ PhotoPicker 选图 → 编号入库 → 完整性校验通过（截图 `安卓挂图入库-编号与完整性校验.png`） |
| 安卓杀进程重开 | ✅ 图片从本机副本加载（截图 `安卓杀进程重开-副本加载.png`） |
| Windows / Web | 构建成功；用户验收通过 |

## 过程坑

- **file_picker 13.x API 重构**：`FilePicker.platform.pickFiles` → 静态 `FilePicker.pickFiles`，无 `withData` 参数，`PlatformFile` 无 bytes 字段改 `readAsBytes()`、内建 `extension` getter——按 13.x 新 API 写
- **测试抓真 bug**：分片子目录未创建导致落盘失败（PathNotFoundException），测试先行暴露 → `f.parent.create(recursive: true)` 修复
- uiautomator 的 Flutter 语义树**每次启动是否暴露文本随机**（受无障碍激活状态影响）→ 原生选图器可 dump，Flutter 页面用截图+固定几何导航兜底
- PhotoPicker 新流程为多选确认制：勾选后须按「Add (N)」确认；**坐标以 dump 为准**（缩放截图换算会点偏）
