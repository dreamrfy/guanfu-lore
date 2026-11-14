# H02 服务端划线存储证据（2026-11-15 · 看门狗 v4/v5 续）

## 需求与实现

划线表 + 接口（按 URL 存取）。契约承接 H01（`extension/content.js` 上报 `{pageUrl, title, quote:{exact,prefix,suffix}}`）。

- `server/src/cloud/syncStore.ts`：
  - 新表 `highlights`（与 sync_rows/change_log/asset_index 同库 `data/sync.db`，`CREATE TABLE IF NOT EXISTS` 自建，无需改 deploy/schema.sql）：`id / page_url / title / quote_exact / quote_prefix / quote_suffix / created_at`，`page_url` 建索引。
  - **幂等键**：`id = sha256(pageUrl ⊕ exact ⊕ prefix ⊕ suffix)` 前 16 位十六进制 → 同一处重复划线重报不重记（返回 `created:false`），与剪藏记录的 clipId 幂等思路同源。
  - `validateHighlightInput`：pageUrl 必填 ≤2048；`quote.exact` 必填 ≤2000（与 locator.js 选区上限对齐）；prefix/suffix ≤64（locator 发 32，留一倍余量）；title 截断到 300 而非拒绝。
  - `saveHighlight / getHighlight / listHighlightsByUrl`：按 URL 取回按划线先后排序（客户端渲染顺序）。
- `server/src/clipServer.ts`：
  - `POST /api/highlights` → `{ok:true, id, created, highlight}`；`GET /api/highlights?pageUrl=…` → `{ok:true, pageUrl, items:[…]}`。
  - 两个路由进 `known` 白名单 → 走既有 `Authorization: Bearer` 定长比较门（H01 扩展已带 Token，直接兼容）；错误码与 sync/assets 同风格（400 + `code`）。

## 自测（真实运行输出）

### 1. 新增 tests/highlights.selftest.ts —— 17/17 ✅

```
✅ 不带 Token 上报 → 401
✅ 不带 Token 读取 → 401
✅ 合法上报 → 200 且 created=true
✅ 返回 16 位十六进制 id
✅ 回带完整划线记录
✅ 同一处重复上报 → 200 且 created=false（幂等）
✅ 同页第二处划线 → created=true
✅ 按 URL 取回 → 两条且按划线先后排序
✅ 条目形状：id/pageUrl/title/quote/createdAt 齐全
✅ 其他页面 → 空清单（按 URL 隔离）
✅ GET 缺 pageUrl 参数 → 400
✅ exact 全空白 → 400 missing_quote
✅ exact 超 2000 字 → 400 quote_too_long
✅ prefix 超 64 字 → 400 quote_side_too_long
✅ 缺 quote → 400 missing_quote
✅ 缺 pageUrl → 400 missing_page_url
✅ 超长 title 被截断入库而非拒绝

全部通过 ✅
```

### 2. 全套件 + 类型检查

```
========== 汇总 ==========
自测脚本: 30 | 失败: 0
全部通过 ✅
TypeScript: No errors found
```

### 3. VPS 现状探测（部署前）

```
VM-0-8-ubuntu
bijiapp-clip | Up 38 hours (healthy)
bijiapp-poll | Up 38 hours
{"ok":true,"service":"bijiapp-clip","pid":1}
```

## 遗留：部署被权限分类器拦（与 S01 同因）

VPS 三关走到第二关被 Claude Code 自动模式分类器拒绝，理由 `[Production Deploy]`（S01 当时是 `[Remote Shell Writes]`，同一道墙）。上传/重建/远端验证未执行；**服务器当前跑的仍是旧代码（无划线接口）**。已拆任务 **H05 服务器部署**（TODO 追加到任务表）：备份两文件 → 上传 → `docker compose up -d --build` → curl health + 真实 POST/GET 验证。回滚材料：`/tmp/clipServer.ts.bak-H02`、`/tmp/syncStore.ts.bak-H02`（本次未上传，H05 执行时先备份再换）。

用户侧放行方式：把 VPS 部署类命令加进 Claude Code 权限白名单（或手动执行 H05 的四条命令）。
