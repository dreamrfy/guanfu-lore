# R03 整改复验证据（2026-11-05，第三轮审计）

> 对应审计单：`E:\VBcoding\_archive\bijiapp-v0.0.1-审计归档\审计报告\bijiapp-v0.0.1-audit3\02-AI整改执行单（第三轮）.md`
> `R01` / `R02` 的原始输出保持不动；本目录是第三轮整改后的复跑输出。

## 文件说明

| 文件 | 生成命令 | 说明 |
| --- | --- | --- |
| `environment.txt` | `date` / `node --version` | Node 24.22.1 |
| `run-all.txt` | `bash tests/run-all.sh` | **19 个自测全通过**（前两轮 18 + 本轮 1） |
| `typecheck.txt` | `./node_modules/.bin/tsc --noEmit` | 类型检查通过（空输出） |
| `pipeline-test.txt` | `node src/cli.ts pipeline-test` | mock 全链 3 → 2（1 complete + 1 partial） |
| `demo-audit.txt` | `node tests/demo-audit.selftest.ts` | **完整图片来源口径**：原始离线文件统计 + 入库记录/落盘快照审计 + 违规判定 |
| `wcag-contrast.txt` | `node scripts/wcag-contrast.mjs` | 84 组合最低 4.56 |

## 第三轮问题 → 验证方式

| 编号 | 修法 | 验证 |
| --- | --- | --- |
| T-01（P0） | `fetch/snapshot.ts` 用 DOM 统计 `img src` / `img srcset` / `source` / CSS `background`；相对引用查文件存在性；只有 `data-src` 不算有效图片 | `offline.selftest.ts`：2007（source 外链）、2008（srcset 外链）、2009（data-src 掩盖）、2010（文件缺失）均为 `partial`；审计计数 external/missing 与预期一致 |
| T-02（P1） | 加固改为 DOM 遍历：过滤 `srcset`、清 CSS `url()`、删 `data-src` | 同一测试检查落盘快照：`evil.example` 不残留、本地图片保留、CSS 里的 SVG 与 `javascript:` 被替换 |
| T-03（P1） | `PipelineDeps.fetchBilibili` 接入，`wire.ts` 用真实实现 | `pipeline.selftest.ts`：B站标题/作者/简介来自 API；未注入时 note 标“未接入”；API 失败记 failures 且不中断 |
| T-04（P1） | 新增完整口径验收脚本 | `demo-audit.selftest.ts`：逐文件统计 + 每记录快照审计，`complete` 且图片有问题即失败（当前 0 违规） |
| T-05（P2） | CSP 改由解析器删除，再无条件注入 | `offline.selftest.ts` 2012（`content="default-src * > script-src *"`）：输出只剩 1 条项目 CSP |
| T-06（P2） | 去掉恒真断言与重复收尾 | `pipeline.selftest.ts` 断言 assets 无 URL、快照有本地引用；文件末尾只有一次汇总 |
| T-07（P3） | 清单页只链接 `ext === "html"` 的资源 | `list-html.selftest.ts`：图片排在 html 前时仍链接 HTML 快照 |

## demo-audit 关键输出（摘）

```text
file                               total  local   ext  miss  invalid
offline_1793735377929.html             4      0     0     0        4   ← 只有 data-src，离线不可读
offline_1793737615697.html            18     18     0     0        0
...
demo: 扫描 8 / 新入库 5 / 跳过 3 / 失败 0
✅ 不存在 complete + 未本地化图片
✅ 样例里的未本地化图片记录为 partial 且标注原因
```

> 统计范围：`img src`、`img srcset`、`picture > source`、CSS `background(-image)` 的 `url()`；
> 相对引用按资源目录实际存在性判断。R02 的旧表只统计 `img src`，口径已作废（见 R02 README 顶部说明）。

## Mimosa 扫描（本轮）

- scanId：`scan-2026-11-04T17-06-50.134Z-689df7b25a29`
- 封印：`sha256:6f8a98391a525c267c0647e1ecd13e23ba2803cf7d343c8a4876a1566470f464`
- 范围：`fetch/snapshot.ts`、`pipeline.ts`、`pipeline/run.ts`、`pipeline/wire.ts`、`pipeline/mock.ts`、`cli.ts`、两个新测试
- 结果：**0 条发现**，依赖风险 0；**扫描状态 `inconclusive`**（调用图不完整），不等于项目已安全

## 本轮未验证的事

- 真实微信客服凭证下的 `poll`（仍一次都没跑过）
- B站真实短链跳转（本轮只用假 transport 验证“白名单接线”，真实跳转未联网复跑）
- 真实公众号抓取的持续稳定性（只有 R01 的一次性冒烟）
- CloudBase / R2 / 云函数（未部署）
