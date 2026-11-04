# bijiapp 服务端（阶段一 · 本地原型）

**Node >= 24 原生直跑 TypeScript**（type stripping），无需构建。
运行时只依赖一个库：`sanitize-html`（HTML 白名单清洗）；其余全部用 Node 内置模块。

## 跑起来

```bash
node src/cli.ts --help
```

## 命令与真实能力

| 命令 | 做什么 | 能力边界 |
| --- | --- | --- |
| `demo` | 导入 `out/offline_*.html` → 幂等落库 | **只覆盖“离线导入”子链路**，不等于消息全链 |
| `list` | 生成 `out/剪藏清单.html` | 读本地库，展示状态与失败原因 |
| `pipeline-test` | 用 mock 依赖离线跑完整链 | 不联网；验证「消息→解析→抓取→图片→状态→落库」编排 |
| `ingest-messages` | 用 `samples/messages.json` 跑完整链 | **会真实抓取公众号**，需要联网 |
| `poll` | 拉微信客服增量消息并入库 | 需要 `KF_SECRETS_FILE`；**尚未用真实凭证验证过** |

> 2026-11-04 审计整改说明：此前帮助里列出的 `fetch`/`poll` 与实际实现不一致（`poll` 未实现）。
> 现在帮助文字、命令、代码三者一致；`poll` 已实现但未做真实凭证冒烟，文档不再宣称“已验证”。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `src/cli.ts` | 命令行入口（命令与实现一一对应） |
| `src/config.ts` | 数据/资源/输出/样本目录 + 凭证路径（**凭证值不进仓库**） |
| `src/store/types.ts` | 数据模型（Clip / AssetRef）——**资源只存编号，不存完整 URL（G1）** |
| `src/store/hash.ts` | SHA-256 摘要（幂等主键 / 资源编号） |
| `src/store/clipId.ts` | 幂等键派生（公众号取 `__biz/mid/idx/sn`） |
| `src/store/localStore.ts` | SQLite（`node:sqlite`）+ 资源落盘（provider=`local`） |
| `src/fetch/http.ts` | 安全 HTTP 层：协议白名单、`net.BlockList` 地址拦截、DNS 钉住、逐跳重定向、响应体上限、分类重试 |
| `src/fetch/htmlSanitize.ts` | HTML 白名单清洗（sanitize-html）、正文抽取、懒加载补 src、图片引用重写 |
| `src/fetch/article.ts` | 公众号 URL 规范化、正文/元数据解析、离线 HTML 生成（含 CSP） |
| `src/fetch/images.ts` | 图片下载：主机白名单 + 魔数校验 + 落盘 |
| `src/fetch/bilibili.ts` | B站公开 API 元数据 |
| `src/sources/wecomMessage.ts` | 微信客服消息 → 归一化条目（异常输入返回 null，不抛错） |
| `src/sources/wecomClient.ts` | 微信客服 `gettoken` / `kf/sync_msg` 客户端（传输层可注入） |
| `src/pipeline/run.ts` | **全链编排 `runPipeline(messages, deps)`**（依赖注入，可离线测试） |
| `src/pipeline/wire.ts` | 生产依赖装配（真实网络 + SQLite） |
| `src/pipeline/status.ts` | 状态判定纯函数 `deriveStatus()`（SNAP-02 红线） |
| `src/pipeline/failure.ts` | 失败分类与有限重试（只有网络类可重试） |
| `src/pipeline/mock.ts` | 测试/演示用 mock 依赖 |
| `samples/` | 真实消息样本（脱敏后） |
| `tests/` | 自测脚本（`bash tests/run-all.sh`） |
| `deploy/` | 上云用配置模板（只写文件，不部署） |

## 全链是什么、验证到什么程度

```
消息 → parseKfMessage → runPipeline
                        ├─ 公众号：canonical URL → 幂等检查 → 抓正文（safeGet）
                        │           → 图片逐张下载（失败降级 partial）→ 图片引用改写
                        │           → 生成离线 HTML（CSP）→ deriveStatus → saveClip
                        └─ 非公众号：仅元数据 → partial（阶段二补正文）
```

- **已可复现**：`bash tests/run-all.sh` 里的 `pipeline.selftest.ts` 用 mock 依赖跑通整条链，
  覆盖完整成功、空正文、缺图、抓取失败、未知消息、幂等重跑。
- **跑过一次真实链路（2026-11-04，非回归测试）**：`ingest-messages` 用 `samples/messages.json` 的
  14 条真实消息、真实抓取公开文章页（**未使用任何凭证**）→ 11 条入库（4 complete / 4 partial / 3 failed），
  31 张图片全部下载成功，重跑 11 条全部跳过（幂等）。证据见 `docs/验收证据/R01-整改复验/`。
  注意：文章内容会变（删除/风控），这次结果**不可逐次复现**，不能替代 mock 回归测试。
- **未验证**：真实微信客服凭证下的 `poll`（一次都没跑过，`gettoken`/`sync_msg` 只用假 transport 测过）。
- **未实现**：云函数入口、CloudBase/R2 存储实现、小红书/抖音正文（需浏览器渲染）。

## 数据模型要点（G1）

- `Clip.assets: AssetRef[]`，其中 `AssetRef = { assetId, provider, ext }`
- **不存完整 URL**：App 要看图时，由服务端按 `assetId + provider` 生成真实地址
- `Clip.sourceUrl` 保留**消息/快照里的原始链接**（一字不删）；抓取与幂等用 `Clip.canonicalUrl`
  （公众号：常量 origin + 白名单参数），两者分开存
- 资源编号（`assetId`）统一 **16 位十六进制**（SHA-256 前 64 位）
- 好处：换存储（CloudBase → R2 → 服务器）只改配置，历史记录一条不动

### ⚠️ 幂等键算法变更（2026-11-04 整改）

旧版用 FNV-1a（32 位状态），所有 id 形如 `wx_00000000xxxxxxxx`（前 8 位恒为 0）；
整改后改用 SHA-256 前 16 位。**两者不兼容**：同一个 URL 在旧库里是旧 id、重新导入会生成新 id，
于是出现“同一篇文章两条记录”。

处理方式（二选一，别混用）：

1. **清空重导**（本地原型推荐）：删 `data/clips.db` 后跑一次 `ingest-messages` / `demo`
2. **迁移旧记录**：按 `source_url` 重算 `clipIdFor(url)` 并更新主键（同时改 `assets_json` 里的快照编号）

> 现状：`server/data/` 是本地开发库（已 gitignore），里面仍留有旧 id 的历史记录；
> 正式数据在接云前应走上面任一方式统一。

## 失败状态含义（SNAP-02）

| 状态 | 含义 |
| --- | --- |
| `pending` | 已入队，尚未抓取 |
| `partial` | 缺图 / 元数据型来源 / 资源落盘失败——**不得标 complete**，`failReason` 写明原因 |
| `complete` | 正文非空、图片全部落盘、快照生成成功（三者同时满足） |
| `failed` | 正文为空或抓取彻底失败，`failReason` 写明分类 |

**空正文永远不会是 `complete`**——这条规则由纯函数 `deriveStatus()` 统一执行，流水线与测试共用。

**离线导入（`demo`）的图片口径**：只认「已本地化」的图片——同目录相对引用或位图 `data:image/png|jpeg|gif|webp`。
外链 `http(s)` 图一律计入失败（离线快照 CSP 禁止外链，断网读不到），记录只能是 `partial/images_failed`；
统计对象是**实际落盘的那份快照**，不是 `js_content` 局部。SVG data URI 不放行。

失败分类（`pipeline/failure.ts`）：`network_timeout` / `blocked_by_platform` / `content_missing` /
`images_failed` / `unsupported_type` / `blocked_address` / `response_too_large` / `internal_error`。

**只有 `network_timeout` 会重试**；数据库、SSRF 拒绝、白名单、正文缺失、未知错误一律 `attempts=1`。

## 安全约束

- 凭证（AppSecret / Token / EncodingAESKey）只从**仓库外**文件读，路径由 `KF_SECRETS_FILE` 传入
- 抓取外部地址：只允许 http/https；拒绝 localhost/环回/私有/保留地址；
  IPv6 **fail-closed**（只放行全球单播 `2000::/3`）；DNS 结果校验后钉住；重定向逐跳复检
- 响应体上限：正文 10MB、图片 20MB（`Content-Length` 与实际累计字节双检）
- HTML **正文**清洗用白名单库（`sanitize-html`）；离线快照额外做整页加固：
  删除 `script`/`iframe`/`base`/`link`、`on*`、`srcdoc`、非位图 `data:`，
  并**强制替换**为项目自己的 CSP（输入自带的 CSP 一律删除，不允许覆盖）
- 数据库访问一律参数绑定；资源文件名/扩展名走白名单 + 路径边界校验

## 测试与类型检查

```bash
bash tests/run-all.sh     # 全部自测（离线；不访问外网、不用真实凭证）
npm run typecheck         # tsc --noEmit
node ../scripts/wcag-contrast.mjs   # 设计 token 对比度（含交互合成底）
```
