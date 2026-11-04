# 部署配置模板（阶段一：本地原型 → CloudBase 上海）

> 本目录只放**配置模板与说明**，不含任何真实凭证。
> 所有 `<占位符>` 在部署时由部署者填写；真实值只存放在本地/云环境变量，**不进仓库**。

---

## 1 部署拓扑

```
微信客服（用户转发）
   ↓ 微信服务器
[云函数 pollFn]（定时触发器：每 30 分钟）
   ↓ 1) sync_msg 拉取消息（只用微信客服专属 Secret）
   ↓ 2) 解析（sources/wecomMessage.ts）→ 归一化条目
   ↓ 3) 公众号条目 → HTTP 抓取（fetch/article.ts 的逻辑，云函数内实现）
   ↓ 4) 图片/快照 → R2（provider=r2，AssetRef 只存编号）
   ↓ 5) 剪藏记录 → CloudBase 数据库（G1：assets 只存编号）
[CloudBase 数据库 + R2]
   ↑
App 客户端（读清单/正文：服务端按 assetId+provider 生成地址）
```

---

## 2 云函数

| 项 | 值 |
| --- | --- |
| 函数名 | `bijiapp-poll` |
| Runtime | **Node.js 24**（项目要求 `>=24`，靠原生 type stripping 直跑 .ts） |
| 内存 | 512 MB 起 |
| 超时 | **300 秒**（抓取 5 篇 × 每篇 10 秒 + 余量） |
| 入口 | `index.main` |
| 环境变量 | 见 §4 |

> ⚠️ **Runtime 风险（接云前必须确认）**：本项目源码是 `.ts` + 原生 type stripping，
> 只有 Node 22.6+（需 `--experimental-strip-types`）或 23/24 能直接跑。
> 如果 CloudBase 只提供 Node 20/22 且不能加启动参数，就必须先 `tsc` 编译成 `.js` 再部署
> （同时处理 import 的 `.ts` 扩展名）。**不要**假定“复制 `.ts` 就能跑”。

**代码结构**（阶段一）：

```
server/cloud/pollFn/
├── index.js          ← 云函数入口（轮询 + 抓取 + 落库）
├── sources/          ← 与 src/sources/ 相同
├── fetch/            ← 与 src/fetch/ 相同（抓取逻辑移植）
└── package.json
```

---

## 3 定时触发器（每 30 分钟）

```json
{
  "triggers": [
    {
      "name": "pollEvery30Min",
      "type": "timer",
      "config": "0 */30 * * * * *"
    }
  ]
}
```

> 说明：云函数定时触发器的 cron 为 7 段（秒 分 时 日 月 星期 年）；
> `0 */30 * * * * *` = 每 30 分钟的第 0 秒触发。

---

## 4 环境变量清单（部署时在控制台配置）

| 键 | 说明 | 示例（占位） |
| --- | --- | --- |
| `WX_CORP_ID` | 企业微信 CorpID | `wwxxxxxxxxxxxxxxxx` |
| `WX_KF_SECRET` | 微信客服专属 Secret | `<部署者填写>` |
| `WX_KF_OPEN_KFID` | 客服账号 ID | `wkxxxxxxxxxxxxxxxx` |
| `CB_ENV_ID` | CloudBase 环境 ID | `biji-gcsb-d6gnwvcjk883b32c7` |
| `R2_ACCOUNT_ID` | Cloudflare 账户 ID | `<32 位十六进制>` |
| `R2_ACCESS_KEY_ID` | R2 访问密钥 ID | `<部署者填写>` |
| `R2_SECRET_ACCESS_KEY` | R2 私有密钥 | `<部署者填写>` |
| `R2_BUCKET` | R2 桶名 | `<部署者填写>` |

**安全约定**：以上值**只**在云控制台/本地环境变量里配置；**一律不进仓库**（含 .env.example——那里只有键名）。

**与本地 `KfSecrets` 的字段映射**（接云时要改 `config.ts`，约 20 行）：

| 云环境变量 | `KfSecrets` 字段 | 说明 |
| --- | --- | --- |
| `WX_CORP_ID` | `corpId` | 企业微信 CorpID |
| `WX_KF_SECRET` | `appSecret` | 微信客服专属 Secret（**不是**通讯录/应用的 Secret） |
| `WX_KF_OPEN_KFID` | （`poll` 的 `open_kfid` 过滤参数） | 当前 `poll` 未按 open_kfid 过滤，接云时再补 |
| `WX_TOKEN` / `WX_ENCODING_AES_KEY` | `token` / `encodingAESKey` | **只用于回调模式**；轮询模式用不到 |

> 本地是「`KF_SECRETS_FILE` 给路径 → 读仓库外 JSON」；云函数通常没有持久文件系统，
> 应新增 `loadSecretsFromEnv()`：优先读环境变量，回退读文件。

---

## 5 数据库表结构（阶段一：SQLite 本地；阶段二：云数据库）

**SQLite 版（本地/云函数内嵌）**：

```sql
CREATE TABLE IF NOT EXISTS clips (
  id            TEXT PRIMARY KEY,      -- 幂等键：规范化源 URL 的哈希（wx_ + 16 hex）
  source        TEXT NOT NULL,         -- wechat_mp / xiaohongshu / bilibili / douyin
  source_url    TEXT NOT NULL,         -- 原始链接（一字不删）
  title         TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT '',
  account       TEXT NOT NULL DEFAULT '',
  published_at  TEXT,
  saved_at      TEXT NOT NULL,         -- 入库时间（ISO）
  text          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL,         -- pending / partial / complete / failed
  fail_reason   TEXT,
  note          TEXT,
  assets_json   TEXT NOT NULL DEFAULT '[]'  -- AssetRef[]（G1：编号 + provider）
);
CREATE INDEX IF NOT EXISTS idx_clips_saved_at ON clips(saved_at);
CREATE INDEX IF NOT EXISTS idx_clips_status   ON clips(status);
```

**说明**：
- `assets_json` 存 `AssetRef[]`（`{assetId, provider, ext}`），**不含完整 URL**
- 资源文件本体在对象存储（R2），按 `assetId.ext` 取
- 索引：`saved_at`（清单按时间排序）、`status`（按状态筛选）

---

## 6 上线前核对（照着勾）

- [ ] **Runtime 确认是 Node 24**（否则先编译成 .js，见 §2 风险提示）
- [ ] 凭证改为环境变量直读（§4，约 20 行）
- [ ] 云函数部署成功，手动触发一次能拉到消息
- [ ] 定时触发器生效（日志可见每 30 分钟一次）
- [ ] 数据库写入/读取正常
- [ ] R2 上传/下载正常
- [ ] 清单页可打开
- [ ] 监控：拉取失败/超阈值提醒
- [ ] **真实凭证冒烟**：本地 `poll` 跑一次（目前一次都没跑过，不能在文档里写“已验证”）
