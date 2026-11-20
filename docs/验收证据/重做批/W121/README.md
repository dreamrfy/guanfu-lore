# W121 扩展/剪藏入口 UI · 验收证据

- 日期：2026-11-20
- 规格：`docs/复刻/09-模块7-收集箱与剪藏.md`、`docs/复刻/27-独有功能设计.md` §3.3/§3.4
- 实现：
  - `app/src/shell/ClipDialog.tsx`：抓取中 → 成功 / 重复 / 失败四态；成功面板 [打开] [继续]；失败面板 [重试] [打开原文]；重复面板 [打开] [继续]
  - `app/src/data/clipIngest.ts`：`ingestClip(result, { open: false })` 支持“先入库、不自动打开记录”
  - `app/src/shell/useGlobalShortcuts.ts`：Ctrl+Shift+V / Ctrl+Alt+V 唤起快速剪藏（捕获阶段，避开浏览器“粘贴为纯文本”）
- 断言：`npm run clip-entry-check` → **PASS**
- 截图：`成功面板.png`、`重复提示.png`、`失败面板.png`

## 点验内容（真实浏览器）

| # | 断言 | 结果 |
| --- | --- | --- |
| 1 | Ctrl+Alt+V 真实按键唤起剪藏弹层 | ✅ |
| 2 | Ctrl+Shift+V 合成事件唤起（处理器存在） | ✅ |
| 3 | 抓取成功 → 成功面板显示“已收进收集箱”+标题+[打开][继续] | ✅ |
| 4 | **真实 Dexie 入库**：剪藏库出现“第一篇测试文章” | ✅ |
| 5 | 点「继续」回到输入态 | ✅ |
| 6 | 同链接再剪 → 重复面板“已经在收集箱里”，不新增记录 | ✅ |
| 7 | 失败链接 → 失败面板显示错误 + [重试][打开原文] | ✅ |
| 8 | 从重复面板点「打开」→ 弹层关闭、记录详情标题正确 | ✅ |

## 快捷键说明（重要）

- Chrome / WebView2 会把 **Ctrl+Shift+V** 当作“粘贴为纯文本”，真实按键事件到不了页面（Playwright 实测 `keydown` 收不到）。
- 处理：捕获阶段监听，既保留 `Ctrl+Shift+V`（Tauri/部分环境可用），又提供 **Ctrl+Alt+V** 作为桌面浏览器可用键；输入框/编辑器内仍放行系统粘贴。
- 点验里：真实按键走 Ctrl+Alt+V；Ctrl+Shift+V 用合成 keydown 验证处理器。

## 命令

```bash
cd app
npm run clip-entry-check
npm test        # 37 files / 277 tests
npm run check   # 图标 + 令牌守卫 + tsc
npm run build
```
