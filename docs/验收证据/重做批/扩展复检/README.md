# 剪藏扩展按 24 号规范复检 · 差距清单

- 日期：2026-11-22
- 范围：`extension/`（manifest.json / popup / content.js / locator.js，共 396 行）对照 `docs/复刻/24-浏览器扩展.md` §8–§9
- 结论：**复检完成，对齐批列为待办**——差距不是小修，是一个独立批次（按需授权会改安装流程，划词工具条是新功能）

## 已符合

- MV3、`action.default_popup`、正文交给服务端清洗的架构方向 ✓（§8 第 1 条）
- Shadow DOM（content.js）+ locator.js 独立正文选择器 ✓（§8 第 3 条）
- 注入按钮存在（content.js mountButton）；划线高亮上报已有雏形（reportHighlight + locator 折叠坐标系，H03 复用）

## 差距（按 §9 迁移表逐条）

| # | spec 要求 | 现状 | 工作量 |
| --- | --- | --- | --- |
| 1 | 品牌：名称改「观复 · Lore 剪藏」、主色 `#2F5D8A`、图标 16/32/48/128 | 名称还是旧名「个人知识库 · 剪藏」；popup 按钮 `#2383e2`；无 icons 字段 | 小 |
| 2 | popup 宽 320 | 现 ~300 布局 | 小 |
| 3 | 按需授权：`optional_host_permissions`，去掉 `<all_urls>` 强制 | 现在 host_permissions + content_scripts 都 `<all_urls>` | 中（改安装/使用流程，需真浏览器验收 §9 断言 7/8） |
| 4 | 离线队列：`chrome.storage.local gf-clip-queue` + `chrome.alarms` 每分钟重试 | 无 | 中 |
| 5 | 划词工具条：不改变选区、Esc 关闭 | 只有剪藏按钮 + 划线上报雏形，无工具条 UI | 中 |

## 建议批次拆分

- 小批（半天）：#1 品牌 + #2 popup 布局 —— 无行为变化，可先做
- 中批（1 天+）：#3 按需授权 + #4 离线队列 —— 行为/权限变化，需 §9 断言 6/7/8 真浏览器验收
- 后批：#5 划词工具条（依赖 H03 划线链路完整）
