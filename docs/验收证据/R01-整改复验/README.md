# R01 整改复验证据（2026-11-04）

> 本目录是**整改后**新增的复验输出，**不改动** `P0-T01/`、`P0-V01/` 里的原始实测证据。
> 判定原则：这里只记录**实际跑出来的输出**；没跑过的（真实微信凭证、云资源）在下方明确列为“未验证”。

## 文件说明

| 文件 | 生成命令 | 说明 |
| --- | --- | --- |
| `environment.txt` | `date` / `node --version` / `ver` | 复验环境（Node 24.22.1） |
| `cli-help.txt` | `node src/cli.ts --help` | 帮助文字与实际命令一致（含 pipeline-test / ingest-messages / poll） |
| `pipeline-test.txt` | `node src/cli.ts pipeline-test` | mock 全链：3 消息 → 2 入库（1 complete + 1 partial），不联网 |
| `run-all.txt` | `bash tests/run-all.sh` | **13 个自测全通过**（原 5 个 + 新增 8 个） |
| `typecheck.txt` | `npx tsc --noEmit` | 类型检查通过（空输出 = 0 错误） |
| `wcag-contrast.txt` | `node scripts/wcag-contrast.mjs` | 84 个组合（含 hover/selected 合成底）最低 4.56，全部 ≥4.5 |
| `demo-isolated.txt` | `KF_DATA_DIR=data-verify node src/cli.ts demo` | 用仓库内真实离线 HTML 导入（隔离目录，不污染正式库） |
| `demo-status.txt` | 读隔离库的 `status/textLen/fail_reason` | **关键证据**：空正文那篇为 `failed/content_missing`，不再标 `complete`；快照已加固（CSP、无 script） |
| `ssrf-normal-connect.txt` | `safeGet('https://example.com/')` + 内网直连探针 | 正常公网 200 可读；`http://127.0.0.1:9/` 被 `EBLOCKED` 拒绝（加固不误杀正常地址） |
| `mimosa-scan.md` | Mimosa deep 扫描两次 | 首扫 1 条高危（游标 path-traversal），加固后复扫 0 发现；扫描状态 `inconclusive`，不得宣称“已安全” |

## 关键回归对照（P0-02）

| 文章 | 整改前 | 整改后 |
| --- | --- | --- |
| 《全网最全Python经典代码实例合集…》 | `complete`，`textLength=0` | **`failed`，`fail_reason=content_missing`** |
| 其余 4 篇 | `complete` | `complete`（正文 516–22047 字） |

## 真实链路一次性冒烟（2026-11-04，非回归测试）

| 文件 | 说明 |
| --- | --- |
| `ingest-messages-real-run1.txt` | 首次真实抓取：14 条真实消息 → 识别 11 → 入库 11（4 complete / 4 partial / 3 failed），31 张图片全部成功 |
| `ingest-messages-real-rerun.txt` | 立刻重跑：`skippedExisting=11`、`saved=0`（真实数据上的幂等验证） |
| `ingest-messages-real-status.txt` | 入库明细：空正文 3 篇为 `failed/content_missing`；B站/小红书/抖音为 `partial`（阶段一只有元数据） |

说明：
- 这次**没有使用任何微信凭证**，只抓取公开文章页；不是自动化测试的一部分（结果依赖线上文章是否还在）。
- 3 篇失败的原因分别是正文容器缺失 / 命中“环境异常、去验证”风控提示——分类正确，不是程序崩溃。
- 不能据此宣称“微信客服链路已验证”：`poll` 仍未用真实凭证跑过。

## 本次**未验证**的事（不得当作已完成）

- 真实微信客服凭证下的 `poll`（一次都没跑过；代码已实现，`gettoken`/`sync_msg` 用假 transport 测过）
- 真实公众号抓取的**持续稳定性**（只跑过上面这一次；文章会删除/风控，结果不可逐次复现）
- CloudBase 部署、R2 存储、Node 24 云函数运行时（详见 `server/deploy/README.md` 的 Runtime 风险）
- 设计稿的像素级走查（走查清单是待执行工具，不是已完成结果）

## 复现方式

```bash
cd server
bash tests/run-all.sh
./node_modules/.bin/tsc --noEmit
node src/cli.ts pipeline-test
node ../scripts/wcag-contrast.mjs
KF_DATA_DIR=data-verify KF_ASSETS_DIR=data-verify/assets node src/cli.ts demo
```
