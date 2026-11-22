# 服务端 R2 备份 · 验收证据

- 日期：2026-11-22（M10-05 服务端半边）
- 实现：
  - 服务端 `server/src/backup/backupStore.ts`：快照进 R2（`backups/backup-<ts>.json`），元数据 `data/backups.json`（最新在前，cap 50），R2 未配置如实报 `r2_not_configured`
  - `clipServer.ts` 路由：`POST /api/backup`（20MB 上限）/ `GET /api/backup`（列表）/ `GET /api/backup/get?key=`（下载恢复）
  - App `backupApi.ts` + 设置页：服务端备份区（备份到服务端 / 自动备份时同步上传 / 服务端快照列表 + 恢复）
  - `backupAuto.ts`：本机快照成功后，若服务端开关开启则自动上传（失败只记日志，不影响本地备份语义）
- 测试：`server/tests/backup.selftest.ts`（401 / r2_not_configured 三路径）；全量 **32 自测脚本全绿**；App **292 条全绿**
- 点验：`npm run backup-settings-check` → **PASS**（本机快照/开关/恢复确认/服务端报错均可读不静默）

## 生产验证（2026-11-22 全过）

- 服务端已重新部署（VPS clip 容器重建，健康 200）。
- 生产 E2E（真实凭证 + 真实 R2）：上传 → 200（key `backups/backup-*.json`，1 页/147B）→ 列表 items≥1 → 下载还原**内容一致**。网络抖动用重试兜底（本机到服务器偶发超时）。

## 边界

- 无删除接口（备份 JSON 小，保留全部；列表 cap 50）——删除/轮换列为后续项。
- R2 未配置时按钮给出可读错误，不假成功。
