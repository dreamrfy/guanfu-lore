# 桌面壳（Tauri，第一版）

按 **D1 决策**：桌面版**不自带剪藏服务**，剪藏统一走云端那台（唯一抓取器，避免同一篇在两边各存一份）。

## 现在是什么

- 一个装好 WebView 的窗口，内容就是 `app/` 里的同一个网页端（`frontendDist: ../dist`）。
- **没有 sidecar、没有本地服务**——壳只负责显示。
- 图标是脚本手写生成的 PNG/ICO（`icons/`），没引入图形库。

## 怎么跑

```bash
cd app
npm install                # 会装 @tauri-apps/cli
npm run build              # 先出前端 dist（壳要从这里加载）
npm run tauri:dev          # 开发：开窗口，连 vite dev server
npm run tauri:build        # 产出 NSIS 安装包（src-tauri/target/release/bundle/nsis/）
```

首次编译 Rust 依赖大概要几分钟（`cargo build --release`）。

## 你要知道的两个坑

1. **桌面壳里的库是空的**：Tauri 用 `tauri://localhost` 这个源，和浏览器里的 `http://localhost:5173`
   是**两套 IndexedDB**，数据不互通。这正是 D4 要解决的（服务器为准 + 同步层）——
   同步层做完后，桌面壳会跟云端对齐。
2. **改前端要重新 build**：`frontendDist` 指向 `../dist`，`npm run tauri:dev` 会自动起 vite；
   但 `tauri:build` 打包时用的是当时的 `dist/` 内容，别忘了先 `npm run build`。

## 打包与分发

- 安装包：NSIS（`installMode: currentUser`，不用管理员）。
- 分发走 **Scoop**（见仓库 `scoop/`）：Scoop 下载的文件不带 Mark-of-the-Web，
  SmartScreen 一般不拦；代码签名证书要花钱且不保证不弹窗。
- 想走 Microsoft Store（MSIX，微软代签、无提示）是另一条路，代价是开发者账号 + 审核。
