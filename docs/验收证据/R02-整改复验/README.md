# R02 整改复验证据（2026-11-04，第二轮审计）

> 对应审计单：`E:\VBcoding\bijiapp-v0.0.1-audit2\02-AI整改执行单（第二轮）.md`
> 本目录是第二轮整改后的复跑输出；`R01-整改复验/` 与更早的 `P0-*/` 原始证据均未改动。

## 文件说明

| 文件 | 生成命令 | 说明 |
| --- | --- | --- |
| `environment.txt` | `date` / `node --version` | 复验环境（Node 24.22.1） |
| `run-all.txt` | `bash tests/run-all.sh` | **18 个自测全通过**（第一轮 13 + 本轮新增 5） |
| `typecheck.txt` | `./node_modules/.bin/tsc --noEmit` | 类型检查通过（空输出） |
| `pipeline-test.txt` | `node src/cli.ts pipeline-test` | mock 全链：3 → 2（1 complete + 1 partial） |
| `demo-isolated.txt` | `KF_DATA_DIR=data-verify node src/cli.ts demo` | 8 个离线 HTML → 新入库 5 / 跳过 3 |
| `demo-status.txt` | 读隔离库 + 读落盘快照 | **关键证据**：`complete` 记录的外链图数为 0；快照均有 CSP、无 script |
| `wcag-contrast.txt` | `node scripts/wcag-contrast.mjs` | 84 组合最低 4.56，全部 ≥4.5 |

## 第一轮遗留问题的复核对照

| 编号 | 第一轮结论 | 本轮复验 |
| --- | --- | --- |
| N-01（P0）外链图仍 complete | 已修 | `demo-status.txt`：0 条违规；外链图记录全部 `partial/images_failed` |
| N-02 CSP 可被输入覆盖 | 已修 | `offline`/`sanitize` 自测：攻击者 CSP 不残留，快照只剩 1 个项目 CSP |
| N-03 B站重定向无白名单 | 已修 | `bilibili.selftest.ts`：`example.com` 等被拒，B站域放行；API 只允许 `api.bilibili.com` |
| N-04 SSRF 保留段 | 已修 | `ssrf.selftest.ts`：`2001:20::1`、`2001:1::1`、`2001:3::1`、`2001:4:112::1`、`192.31.196.1` 等全部拒绝 |
| N-05 文档历史表述 | 已修 | 开发状态历史批次标【历史口径】；报告任务1 扫描输出注明“不能作为安全结论” |
| N-06 SVG data URI | 已修 | `sanitize`/`offline` 自测：SVG 被拒，png/jpeg/gif/webp 保留 |
| N-07 去重断言写反 | 已修 | `pipeline.selftest.ts`：重复 manifest 只下载 1 次、`imagesTotal=1` |
| N-08 poll token 语义 | 已修 | `wecom.selftest.ts`：逐页 cursor/token 成对传递；`has_more=1` 无 cursor 时停止 |
| N-09 token TTL | 已修 | `expires_in=0` 时立即重新取 token；正常 TTL 仍缓存 |
| N-10 凭证路径 | 已修 | `config.selftest.ts`：仓库内路径（含相对/绝对）被拒，仓库外可读 |
| N-11 sourceUrl 契约 | 已修 | `pipeline.selftest.ts` + `offline.selftest.ts`：原始 URL 逐字保留，`canonicalUrl` 另存 |
| N-12 assetId 位数 | 已修 | `clipid.selftest.ts`：`assetIdFor` 输出 16 位十六进制 |
| N-13 文档合成底表 | 已修 | `wcag-doc-sync.selftest.ts` 逐行比对文档与脚本输出 |
| N-14 空快照链接 | 已修 | `list-html.selftest.ts`：无资源记录输出“无快照”，行内无 `href` |

## Mimosa 扫描（本轮）

- scanId：`scan-2026-11-04T04-58-53.605Z-b56853e558b1`
- 封印：`sha256:380dbfd77a23d60208dd2d3b503865cd0af29401e371d932ff4f437fd4cd9612`
- 范围：本轮改动的主要源码文件（12 个）+ 对比度脚本
- 结果：**0 条发现**，依赖风险 0
- **覆盖缺口**：调用图部分不完整，扫描状态 `inconclusive`
- 口径：只能说“上述文件在该次扫描范围内 0 发现”，**不能**说项目已通过安全审计

## 本轮未验证的事

- 真实微信客服凭证下的 `poll`（仍一次都没跑过；`gettoken`/`sync_msg` 只用假 transport 测过）
- 真实公众号抓取的持续稳定性（只做过一次冒烟，见 `R01-整改复验/ingest-messages-real-*.txt`）
- 云函数 / CloudBase / R2（未部署）
- B站真实短链跳转（本轮只用假 transport 验证白名单接线；真实跳转未联网复跑）
