# W123 剪藏走查 · 验收证据

- 日期：2026-11-20
- 走查文档：`docs/复刻/重做-W10收集箱走查.md`
- 断言：`npm run clip-walkthrough` → **PASS**
- 截图：
  - `01-剪贴板提示.png`
  - `02-入库成功.png`
  - `03-记录详情.png`
  - `04-打开快照.png`
  - `05-收集箱列表.png`

## 全链 6 步

1. 剪贴板提示 → 2. 收进自动抓取 → 3. 打开记录 → 4. 打开离线快照 →
5. 剪藏库收集箱列表 → 6. 列表点行打开记录。

## 走查中修掉的真问题

1. **离线快照中文乱码**：blob HTML 缺 `<meta charset="utf-8">`，中文 Windows 按 GBK 解析。
   `ensureUtf8Meta()` 在保存快照时统一补；单测 3 条。
2. **记录详情属性编辑器全部展开**：`CellEditor` 增加 `mode="panel"`，select/date 默认收起，
   点一下再展开；记录详情恢复干净形态。
3. （W120 已修）主页挡住表格、openTab 不清表格态。

## 命令

```bash
cd app
npm run clip-walkthrough
npm test        # 38 files / 284 tests
npm run check   # 图标 + 令牌守卫 + tsc
npm run build
```
