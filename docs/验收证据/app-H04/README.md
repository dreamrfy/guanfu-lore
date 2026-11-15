# H04 全链自验证据（2026-11-15 · 看门狗 v4/v5 续）

## 需求

扩展划线 → 客户端看到高亮 的端到端全链证据（H01 选区上报 + H02 服务端契约 + H03 客户端渲染 三个任务拼成一条真链）。

## 走查方式（真浏览器、真扩展、真 IndexedDB）

`walkthrough.mjs`（playwright-core 连 Chrome 调试端口 9223）按真实契约走完全链：

1. **扩展 popup 配置**：服务地址 `http://127.0.0.1:8787` + Token 写入 chrome.storage.local（截图 1 前置）。
2. **活页文章**（mock 服务的 `article.html`）选中第一段 → 浮钮「🖍 划线」→ POST /api/highlights →「已划线」提示（截图 1、2）。
3. 第二段再划一条，验证多条共存（截图 3）。
4. **客户端**（vite 5173）开机自动 pull 入库 → 收集箱出现记录（未读角标 1）→ 点开标已读 → 详情页出现「🖍 划线（2）」，两条摘录的 `<mark>` 命中段与划线原文逐字一致（截图 4）。

脚本自校验输出（真跑日志）：

```
[h04] 扩展 ID（chrome://extensions）= phfmgljmlahjhncjdmelfadhhlpmiing
[h04] 已划线: 验证扩展划线会按引文定位回客户端正文
[h04] 已划线: 多条划线共存
[h04] mock 划线数 = 2 （应为 2）
[h04] 侧栏角标 = 1
[h04] 划线区块 = 🖍 划线（2） | mark 数 = 2
[h04] mark 内容 = ["验证扩展划线会按引文定位回客户端正文","多条划线共存"]
```

mock 服务请求日志（mock-log.txt）可见全链调用：`GET /api/clips` → `GET /api/clips/{id}` → `GET /api/asset` → `GET /api/highlights?pageUrl=…`（客户端渲染取数）。

## 截图（shots/）

| 文件 | 内容 |
| --- | --- |
| 1-文章页选区划线浮钮.png | 活页文章第一段选区 + 「🖍 划线」浮钮（右下另有「剪藏」浮钮） |
| 2-划线成功-已划线提示.png | 上报成功后「已划线」提示 |
| 3-第二条划线成功.png | 第二段划线成功（多条共存） |
| 4-客户端详情-划线区块.png | 客户端详情页「🖍 划线（2）」两条摘录、mark 黄底命中段与原文逐字一致 |

## 环境注意（留给复跑者）

- **Chrome 137+ 品牌版已移除 `--load-extension`**：本机品牌 Chrome 157 静默忽略该 flag，扩展根本不加载（chrome://extensions 为空、扩展页导航 `ERR_BLOCKED_BY_CLIENT`）。解法：用 **Chrome for Testing**（`E:/dev/tmp/cft/chrome-win64/chrome.exe`，157.0.8103.78）启动调试实例，flag 恢复生效。
- **未打包扩展 ID 的路径哈希兜底算法对不上**（157 的 id 派生已变）：walkthrough 增加第三处兜底——从 `chrome://extensions` 的双层 shadow DOM（`extensions-item-list` → `extensions-item` 的 id 属性）读真 ID。
- ESM 的 import 按脚本文件位置解析依赖，cwd 无关：walkthrough 需放在有 playwright-core 的目录（E:/dev/tools/flowus-cap）跑。

## 与 H05 的关系

服务端按 **H02 真实契约 mock**（同 I03 的验收口径）：真浏览器+真扩展+真 IndexedDB，链路里唯一替身是 8787 的 HTTP 实现。H05（VPS 部署，等用户放行）完成后，把 popup 服务地址换成真实服务端即可复用本 walkthrough 复验真服务链。
