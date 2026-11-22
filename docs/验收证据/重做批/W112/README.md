# W112 公开只读渲染 · 验收证据

- 日期：2026-11-22
- 实现：`server/src/share/sharePage.ts`（手写服务端渲染器 + 失效页）+ `clipServer.ts` 的 `GET /s/<token>` 与 `GET /s/<token>/a/<assetId>` 路由
- 设计约束：服务端手写渲染不引编辑器依赖；动态文本全量 `escapeHtml`；`noindex` meta + `X-Robots-Tag` 双保险；图片仅放行本页正文出现过的 `asset://`（路由层白名单校验，防用 token 枚举别人附件）；相对路径 `./a/<id>`，换域名不用改渲染
- 支持块型：标题1-3 / 段落（粗斜体·行内代码·链接）/ 无序·有序列表 / 待办 / 引用 / 代码块 / 分隔线 / 图片与附件；未识别块型兜底渲染纯文本，不静默丢字

## 断言

| 脚本 | 内容 | 结果 |
| --- | --- | --- |
| `server/tests/share.selftest.ts` | 匿名 200 / noindex 双保险 / 内容齐全 / 图片路由 / 错 token 404 / 附件白名单拒绝 | ✅ |
| `npm run share-page-shot` | 起真服务→推演示页→真浏览器渲染截图 | ✅ 全过 |

截图：
- `公开页-桌面.png`（900px：标题/富文本/列表/待办/引用/代码块/页脚）
- `公开页-手机.png`（390px 窄屏）
- `公开页-已失效.png`（撤销后 404 失效页）

## 命令

```bash
cd server && node tests/share.selftest.ts
cd app && npm run share-page-shot
```
