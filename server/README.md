# bijiapp 服务端（阶段一 · 本地原型）

零依赖、无需构建：**Node >= 24 原生直跑 TypeScript**（type stripping）。

## 跑起来

```bash
node src/cli.ts --help
```

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `src/cli.ts` | 命令行入口 |
| `src/config.ts` | 配置与凭证路径（**凭证值不进仓库**，从环境变量指向的仓库外文件读） |
| `src/store/types.ts` | 数据模型（Clip / AssetRef）——**资源只存编号，不存完整 URL（G1）** |
| `src/store/` | 存储层：本地 SQLite/JSONL + 图片落盘（provider=`local`） |
| `src/fetch/` | 抓取层：公众号正文/图片、B站元数据 |
| `src/sources/` | 来源解析：微信客服消息 → 归一化条目（**入口可替换，G4**） |
| `src/pipeline.ts` | 全链：消息 → 剪藏记录（幂等） |
| `samples/` | 真实消息样本（脱敏后） |
| `tests/` | 自测脚本 |
| `deploy/` | 上云用的配置模板（只写文件，不部署） |

## 数据模型要点（G1）

- `Clip.assets: AssetRef[]`，其中 `AssetRef = { assetId, provider, ext }`
- **不存完整 URL**：App 要看图时，由服务端按 `assetId + provider` 生成真实地址
- 好处：换存储（CloudBase → R2 → 服务器）只改配置，历史记录一条不动

## 约束

- 凭证（AppSecret / Token / EncodingAESKey）只从**仓库外**文件读，路径由环境变量 `KF_SECRETS_FILE` 传入
- 抓取外部地址时只允许 http/https，拒绝 localhost/环回/私有/保留地址
- 数据库访问一律参数绑定
