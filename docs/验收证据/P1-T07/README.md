# P1-T07 设置页骨架与诊断日志脱敏（2026-11-08，**已验收关包**）

> 验收标准（任务表）：设置里看到存储占用；日志里搜不到密钥和正文全文。
> **结论：用户回「通过」。**

## 交付物

| 文件 | 职责 |
| --- | --- |
| `client/lib/data/diagnostics.dart` | 诊断日志：100 条环形缓冲 + 出厂脱敏（形似密钥的赋值一律掩码 `<已脱敏>`；文本载荷只允许以 `<文本 N 字>` 替身出现） |
| `client/lib/data/storage_stats*.dart` | 存储占用统计（条件导出三端：原生读真实文件，网页报数据库计数显示「浏览器托管」） |
| `client/lib/main.dart` | 设置页（存储占用卡片 + 诊断日志列表 + 清空日志）；全 App 关键动作打点（保存成功/失败、图片入库、删除恢复、清空回收站——只含编号与计数） |
| `client/test/diagnostics_test.dart` | 4 个脱敏专项测试（掩码/替身/环形容量/清空），24/24 全绿 |

## 实测记录（安卓模拟器）

| 项 | 结果 |
| --- | --- |
| 设置页存储占用 | ✅ 数据库 406.3 KB、图片副本 194.7 KB / 2 个、页面数 2、资源数 2、待恢复草稿 0（截图 `安卓设置页-存储占用修复后.png`） |
| 脱敏规则 | 4 个单元测试证明：密钥原文不出现、正文只记字数、环形缓冲封顶 100、丢弃有计数 |
| 诊断日志打点 | 已覆盖 page.created / content.saved / content.saveFailed / draft.restored / asset.saved / asset.integrityFail / page.trashed / page.restored / trash.emptied |

## 过程中发现并修复

- **库文件路径猜错**：drift_flutter 默认库在 documents 目录（app_flutter/），我读了 support 目录 → 数据库显示 0 字节「浏览器托管」。对齐到 documents 后显示真实 406.3 KB。**教训：drift_flutter 的库目录（documents）与资源目录（support）不同，别猜**
- 诊断日志的正则转义层数写错（`\\\\s` 变成匹配「反斜杠+s」）→ raw string + caseSensitive 命名参数重写
- 条件导出共享类漏 export（StorageStats 类型在 main.dart 不可见）→ 补 `export 'storage_stats_common.dart'`
