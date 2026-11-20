# W131 深浅双主题全量走查 · 验收证据

- 日期：2026-11-20
- 走查文档：`docs/复刻/重做-W11双主题走查.md`
- 脚本：`npm run theme-walkthrough` → **PASS**
- 覆盖：8 模块 × 浅/深 = 16 张截图
  - 01-首页
  - 02-页面与编辑器
  - 03-多维表
  - 04-收集箱
  - 05-搜索
  - 06-AI面板
  - 07-设置
  - 08-分享面板
- 拼图：`contact-sheet.png`（4×4）

## 断言

| # | 断言 | 结果 |
| --- | --- | --- |
| 1 | 每个模块 `html[data-theme]` 在 light/dark 间真实切换 | ✅ |
| 2 | 每个模块至少一个关键表面（背景/文字/边框）随主题变化 | ✅ 2–4 个/模块 |
| 3 | 浅色 ↔ 深色往返无残留 | ✅ |
| 4 | 弹层（搜索/设置/分享）不出现白卡 | ✅ |

## 命令

```bash
cd app
npm run theme-walkthrough
npm test        # 38 files / 284 tests
npm run check   # 图标 + 令牌守卫 + tsc
npm run build
```
