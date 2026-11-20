# W122 观复独有链路对照 · 验收证据

- 日期：2026-11-20
- 规格：`docs/复刻/27-独有功能设计.md` §3.3（复制链接 / 桌面入口）
- 实现：
  - `app/src/data/clipClipboard.ts`：从剪贴板文本提取微信/B站链接、忽略记录（按归一化 key）
  - `app/src/shell/ClipboardBanner.tsx`：首页顶部「检测到链接，收进收集箱？」[收进][忽略]
  - `app/src/shell/ClipDialog.tsx`：`initialUrl` 预填并自动抓取；成功后仍走 W121 四态面板
  - `app/src/shell/AppShell.tsx`：提示条只在桌面主页出现
- 断言：`npm run clip-banner-check` → **PASS**
- 截图：`剪贴板提示.png`、`收进成功.png`

## 点验内容（真实浏览器）

| # | 断言 | 结果 |
| --- | --- | --- |
| 1 | 剪贴板含微信文章链接 → 首页顶部出现提示条 + 链接 | ✅ |
| 2 | 点「收进」→ 弹层打开并自动抓取 → 成功面板 | ✅ |
| 3 | **真实 Dexie 入库**：剪藏库出现“剪贴板收进的文章” | ✅ |
| 4 | 收进后提示条消失 | ✅ |
| 5 | 点「忽略」→ 提示条消失；再次聚焦不再提示 | ✅ |
| 6 | 普通网页链接不提示 | ✅ |

## 说明

- 剪贴板读取需要浏览器权限；权限拒绝/不支持时完全静默，不弹错误。
- 忽略记录按 `clipLinkKey` 归一化，微信 `from/scene` 等追踪参数变化仍算同一条。
- 安卓分享 Sheet 属于 A13（暂停等 UI 重做），本轮只做 Web/桌面入口；服务号转发由服务端剪藏箱承接（W121 已可见）。

## 命令

```bash
cd app
npm run clip-banner-check
npm test        # 38 files / 281 tests
npm run check   # 图标 + 令牌守卫 + tsc
npm run build
```
