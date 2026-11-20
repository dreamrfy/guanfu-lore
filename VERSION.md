# 观复 · Lore（guanfu-lore）版本标识

> ⚠️ **本文件记录 v0.0.1「阶段一 · 服务端本地原型」的历史交付，不是当前开发版本。**
> 当前开发版为 **v0.1.1（FlowUs 重做批）**，进度见 `开发状态.md` 与 `docs/复刻/重做批-进度与交接.md`。

- **版本号**：`v0.0.1`（正式版 · 阶段一「服务端本地原型」）
- **发布日期**：2026-11-05
- **代码基线**：git 提交 `421de3c`，打了 tag `v0.0.1`
- **运行环境**：Node.js >= 24（开发与验收均在 24.22.1）
- **交付形态**：本地可运行的服务端原型（**未部署**；真实凭证下的 `poll` 已于 2026-11-05 冒烟通过）

## 这个版本是什么

微信转发 → 企业微信「微信客服」→ 服务端轮询拉取 → 解析来源 → 抓正文与图片 →
SQLite 落库 → 生成离线 HTML 快照与清单页。附接云准备模板（CloudBase + R2）与设计规范文档。

## 验证结论（可复跑）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 自测 | 19 个全通过 | `docs/验收证据/R03-整改复验/run-all.txt` |
| 类型检查 | `tsc --noEmit` 0 错误 | `R03-整改复验/typecheck.txt` |
| mock 全链 | 3 消息 → 2 入库（1 complete + 1 partial） | `R03-整改复验/pipeline-test.txt` |
| 离线导入 | 8 个真实离线 HTML → 5 入库；0 条「complete + 有问题的图片」 | `R03-整改复验/demo-audit.txt` |
| 设计对比度 | 84 组合最低 4.56，全部 ≥4.5 | `R03-整改复验/wcag-contrast.txt` |
| 静态扫描 | 第三轮改动文件 0 发现；扫描状态 `inconclusive` | `R03-整改复验/README.md` |
| 真实凭证 poll 冒烟 | 18 条消息（含旧 14）→ 幂等跳过 11、新入库 4（1 complete / 2 partial / 1 failed），图片 2/2，游标落盘 | `真实poll冒烟-2026-11-05/poll-output.txt` |

## 未验证（不得当作已完成）

- CloudBase / R2 / 云函数：未部署；云函数 Runtime 需 Node 24
- B站封面 URL 已获取但未下载落盘（元数据链路已实测；封面落盘接云时补）
- 真实公众号抓取的持续稳定性：两次真实运行（2026-11-04 一次性 14 条、2026-11-05 冒烟 18 条）均正常，但尚无长时间连续运行数据
- 设计稿像素级走查：走查清单是待执行工具

## 快速开始

```bash
cd server
bash tests/run-all.sh              # 19 个自测
node src/cli.ts pipeline-test      # 离线 mock 全链
node src/cli.ts demo               # 导入 server/out/offline_*.html
node src/cli.ts list               # 生成清单页
node ../scripts/wcag-contrast.mjs  # 设计对比度
```

命令与能力边界见 `server/README.md`；发布细节见 `docs/发布说明-v0.0.1.md`。

## 历史审计归档

一至三轮外部审计的快照与报告（共 175MB）已归档到：
`E:\VBcoding\_archive\bijiapp-v0.0.1-审计归档\`（含说明与索引）
