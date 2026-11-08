# P1-T08 本机备份/恢复脚本（P1 收官包，2026-11-08）

> 验收标准（任务表）：AI 跑一次备份→改坏数据→恢复；看到恢复前后的差异报告。
> **结论：全流程实测通过（备份→verify→破坏→诚实报错→恢复→差异报告一致=True）。**

## 交付物

`scripts/client-backup.ps1`——三子命令安全网脚本（对模拟器/真机经 adb 操作）：

- **backup**：停 App（取静止快照）→ 设备侧打单个 tar → 拉取 → python 解包 → 临时副本计数（页/资源）→ manifest.json（全部文件 SHA-256）
- **verify**：按 manifest 重算全文件哈希
- **restore**：停 App → 推回 db+wal+图片副本 → 校验计数

## 实测记录（备份名 demo9）

| 步骤 | 结果 |
| --- | --- |
| backup | `BACKUP_OK pages=2 assets=2`（hello-p1t02 活跃 + Welcome 在回收站） |
| verify | `VERIFY_OK all 4 files intact`（db/wal/shm + tar 全哈希一致） |
| 改坏数据 | 主库前 8KB 覆盖随机字节 **且** 删除 wal/shm |
| App 反应 | **诚实报错**「数据库读取失败：SqliteException(26): file is not a database」——不崩溃、不偷偷重建（截图①） |
| restore | `RESTORE_OK pages=2 assets=2` |
| 恢复后 | App 复活，列表/回收站/资源原样（截图②）；**差异报告：备份时 pages=2 assets=2 ≡ 恢复后 pages=2 assets=2 → 一致=True** |

## 意外之喜（实测观察）

第一次只破坏主库文件时 App **照常工作**——WAL 里存着完整近期状态，SQLite 打开时自动从 WAL 恢复。SQLite 的 wal 机制本身就是第一道防线，本脚本是第二道。

## 过程坑（沉淀）

1. **活库逐文件拉取不可靠**：App 运行中 SQLite 的 checkpoint 会把字节在 db/wal 间搬动，拉到的文件对自相矛盾（db 拉完 12288B 转眼变 45056B、wal 消失）→ 停 App + 设备侧单 tar + 单文件拉取
2. **python sqlite3.connect 不 close = 幽灵突变**：解释器退出时的干净关闭会 checkpoint 并删除 wal/shm——备份脚本自己的计数查询把工件改了！→ 计数一律在临时副本上做，绝不碰备份工件
3. PowerShell 5.1：native 命令 stderr + Stop 偏好 = NativeCommandError 假死；adb pull 进度写 stderr → ErrorActionPreference 用 Continue + 显式存在性检查
4. adb root 随模拟器重启失效，pull /data/data 前需重新 `adb root`
