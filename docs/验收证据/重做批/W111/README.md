# W111 公开链接生成 · 验收证据

- 日期：2026-11-22
- 实现：
  - 服务端 `server/src/share/shareStore.ts`（data/shares.json：一个页面一个有效 token，幂等开启、关闭撤销、重开换新 token）
  - 服务端 `server/src/clipServer.ts`：`POST/GET/DELETE /api/share`（鉴权内）+ `GET /s/<token>`（公开）
  - App `app/src/data/shareApi.ts`（复用剪藏服务地址+Token）+ `app/src/shell/SharePanel.tsx`（W110 面板接真实状态）
- 域名（用户 2026-11-21 拍板）：`https://share.guanfu.app/s/<22位随机token>`；DNS 已由 AI 用现有 CF token 建（CNAME → 同一隧道）
- 匿名策略（用户拍板按推荐默认）：token 不可枚举、链接永久有效直到关闭、noindex、暂无密码

## 断言

| 脚本 | 断言数 | 结果 |
| --- | --- | --- |
| `server/tests/share.selftest.ts` | 20 | ✅ 全过（401 鉴权 / 幂等 / 匿名可读 / noindex 双保险 / 错 token 404 / 撤销即失效 / 重开新 token / 状态查询） |
| `npm run share-panel-check` | 6 组 | ✅ 全过（状态流 GET→POST→DELETE、徽章切换、链接展示与复制、撤销后链接行消失） |
| `npm test` | 38 文件 / 284 测试 | ✅ |
| `npm run check` / `npm run build` | — | ✅ |

截图：`分享面板-公开.png`（公开态：徽章「公开」+ 链接 + 复制链接）。

## 命令

```bash
cd server && node tests/share.selftest.ts
cd app && npm run share-panel-check && npm test && npm run check && npm run build
```
