# 观复 · Lore 服务端（阶段一 · 本地原型）

**Node >= 24 原生直跑 TypeScript**（type stripping），无需构建。
运行时依赖：`sanitize-html`（正文白名单清洗）+ `htmlparser2`/`domutils`/`dom-serializer`/`domhandler`（离线快照的 DOM 审计与加固）；其余用 Node 内置模块。

## 跑起来

```bash
node src/cli.ts --help
```

## 本地联调桩（`tests/fixtures/`）

```bash
node tests/fixtures/mock-mcp.mjs   # MCP: http://127.0.0.1:8901/mcp
node tests/fixtures/mock-ai.mjs    # AI : http://127.0.0.1:8899/v1
```

只用于验证网页端的 AI / MCP 界面与「工具调用闭环」，不参与生产。mock AI 在请求带 `tools`
时会先返回一次 `tool_call`（`mcp_0`，查北京天气），收到工具回执后再给最终回答。

## 剪藏 HTTP 接口（给网页端「快速剪藏」用）

```bash
node src/clipServer.ts [--port 8787]
```

- 只监听 `127.0.0.1`，不对外网开放。
- `POST /api/clip`，请求体 `{"url":"<公众号或B站链接>"}`：
  返回 `{ ok, clip, contentHtml, snapshotHtml, assets }`。图片以 base64 返回；`snapshotHtml`
  是图片已内联的自包含 HTML 快照。失败时返回 `{ ok:false, code, error }`。
- `GET /api/health`：健康检查。
- 允许来源默认 `http://localhost:5173`、`http://127.0.0.1:5173`、`http://localhost:5174`、`http://127.0.0.1:5174`；
  用 `CLIP_HTTP_ORIGINS`（逗号分隔）覆盖。
- 默认数据目录是 `server/data`；联调想隔离时用 `KF_DATA_DIR` / `KF_ASSETS_DIR` 指到别处。
- 失败的剪藏记录会在下次手动重试时自动清掉再抓，不会被幂等键永久挡住。

## 命令与真实能力

| 命令 | 做什么 | 能力边界 |
| --- | --- | --- |
| `demo` | 导入 `out/offline_*.html` → 幂等落库 | **只覆盖“离线导入”子链路**，不等于消息全链 |
| `list` | 生成 `out/剪藏清单.html` | 读本地库，展示状态与失败原因 |
| `pipeline-test` | 用 mock 依赖离线跑完整链 | 不联网；验证「消息→解析→抓取→图片→状态→落库」编排 |
| `ingest-messages` | 用 `samples/messages.json` 跑完整链 | **会真实抓取公众号**，需要联网 |
| `poll` | 拉微信客服增量消息并入库 | 需要 `KF_SECRETS_FILE`；2026-11-05 真实凭证冒烟通过（证据 `docs/验收证据/真实poll冒烟-2026-11-05/`） |

> 2026-11-04 审计整改说明：此前帮助里列出的 `fetch`/`poll` 与实际实现不一致（`poll` 未实现）。
> 现在帮助文字、命令、代码三者一致；`poll` 已实现但未做真实凭证冒烟，文档不再宣称“已验证”。
> 2026-11-05 更新：真实凭证冒烟已通过（18 条消息 → 4 条新入库，幂等跳过 11 条旧消息），见「全链验证」一节。

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
| `src/fetch/bilibili.ts` | B站公开 API 元数据（短链入口/API 均有主机白名单，已接入 `runPipeline`） |
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
                        └─ 非公众号：元数据 → partial（阶段二补正文）
                             ├ B站：调用公开 API（标题/简介/UP主/封面）写入记录
                             └ 小红书/抖音：只存转发文案里的标题/描述/标签
```

- **已可复现**：`bash tests/run-all.sh` 里的 `pipeline.selftest.ts` 用 mock 依赖跑通整条链，
  覆盖完整成功、空正文、缺图、抓取失败、未知消息、幂等重跑。
- **跑过一次真实链路（2026-11-04，非回归测试）**：`ingest-messages` 用 `samples/messages.json` 的
  14 条真实消息、真实抓取公开文章页（**未使用任何凭证**）→ 11 条入库（4 complete / 4 partial / 3 failed），
  31 张图片全部下载成功，重跑 11 条全部跳过（幂等）。证据见 `docs/验收证据/R01-整改复验/`。
  注意：文章内容会变（删除/风控），这次结果**不可逐次复现**，不能替代 mock 回归测试。
- **已冒烟（2026-11-05，真实凭证）**：`poll` 全链一次跑通——18 条消息（含旧 14 条）→ 11 条幂等跳过、
  4 条新入库（1 complete / 2 partial / 1 failed），图片 2/2 成功，游标落盘。
  已知发现：①`http://` 开头的公众号链接被白名单拒绝（待拍板是否做 http→https 规范化）；
  ②B站封面 URL 已获取但未下载落盘（接云时补）。
  证据见 `docs/验收证据/真实poll冒烟-2026-11-05/`。
- **未验证**：云函数入口与 R2 云上存储（已打包未部署；2026-11-05 拍板路线 A——记录/游标/资源全存 R2，不碰 CloudBase 数据库，因用户环境实测为 PG 模式无文档型数据库）；B站字幕/评论等扩展字段（阶段二）。
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

**离线导入（`demo`）的图片口径**（第三轮 T-01/T-02）：
计入的图片来源是**整页全部**——`img src`、`img srcset`、`picture > source`、CSS `background(-image)` 的 `url()`；
只有「位图 data URI」和「资源目录里真实存在的相对引用」才算成功，其余（外链、SVG data、缺失文件、只有 `data-src`）
一律计入失败，记录只能是 `partial/images_failed`。

落盘快照还会做整页加固：外链/脚本型资源引用从快照里移除（`img src`、`srcset`、`source`、CSS `url()`），
`data-src` 删除；CSP 由本项目**无条件注入唯一一条**（输入自带的 CSP 一律先删，属性值里含 `>` 也由解析器处理）。

失败分类（`pipeline/failure.ts`）：`network_timeout` / `blocked_by_platform` / `content_missing` /
`images_failed` / `unsupported_type` / `blocked_address` / `response_too_large` / `internal_error`。

**只有 `network_timeout` 会重试**；数据库、SSRF 拒绝、白名单、正文缺失、未知错误一律 `attempts=1`。

## 安全约束

- 凭证（AppSecret / Token / EncodingAESKey）只从**仓库外**文件读，路径由 `KF_SECRETS_FILE` 传入
- 抓取外部地址：只允许 http/https；拒绝 localhost/环回/私有/保留地址；
  IPv6 **fail-closed**（只放行全球单播 `2000::/3`）；DNS 结果校验后钉住；重定向逐跳复检
- 公众号链接允许 **http→https 规范化**（2026-11-05 冒烟拍板）：仅当 origin 恰为
  `http://mp.weixin.qq.com`（无端口、无尾点变体）时升级为 https 再走常规校验；
  其余 http 变体仍拒绝；抓取全程仍 https，主机不变，攻击面不变
- 响应体上限：正文 10MB、图片 20MB（`Content-Length` 与实际累计字节双检）
- HTML **正文**清洗用白名单库（`sanitize-html`）；离线快照的整页加固基于 **DOM（htmlparser2）**：
  删除 `script`/`iframe`/`base`/`link`、`on*`、`srcdoc`、`javascript:`、非位图 `data:`、外链资源引用，
  并**强制替换**为项目自己的 CSP（不用正则解析 meta，避免属性值含 `>` 时漏清）
- 数据库访问一律参数绑定；资源文件名/扩展名走白名单 + 路径边界校验

## 测试与类型检查

```bash
bash tests/run-all.sh     # 全部自测（离线；不访问外网、不用真实凭证）
npm run typecheck         # tsc --noEmit
node ../scripts/wcag-contrast.mjs   # 设计 token 对比度（含交互合成底）
```
