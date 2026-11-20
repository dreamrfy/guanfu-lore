# W132 Tauri 终版打包 · 验收证据

- 日期：2026-11-21
- 构建：`npm run build`（前端，22:32 最新代码）→ `npm run tauri:build`（NSIS + 更新签名）
- 产物（23:47）：
  - `app/src-tauri/target/release/bundle/nsis/guanfu-lore_0.1.0_x64-setup.exe`（3.52 MB）
  - `guanfu-lore_0.1.0_x64-setup.exe.sig`（updater 签名，密钥 `E:/credentials/tauri-updater/bijiapp.key`）
- 安装：静默 `/S` 安装成功；本机安装位置为既有目录 `C:/Users/12589/scoop/apps/guanfu-lore/0.1.0/`（Tauri NSIS 读取历史 InstallLocation 就地升级），`guanfu-lore.exe` 时间戳 = 构建时间 23:47。
- 冒烟：`npm run installed-w132-smoke` → **PASS**（CDP 9226 连真实安装版）

## 冒烟 5 步（真实安装版，非 dev）

| # | 步骤 | 断言 | 证据 |
| --- | --- | --- | --- |
| 1 | 外壳 | `window.__TAURI__` 存在；窗口/页签栏/侧栏完整 | `冒烟1-外壳.png` |
| 2 | 开页签 | `.tabbar__new` 点击后页签数 2 | `冒烟2-开页签.png` |
| 3 | 编辑器 | 真实敲入文字 → 保存（字数 23、块数 1） | `冒烟3-编辑器.png` |
| 4 | 多维表 | 「新建表格」→「新建记录」→ 1 行 | `冒烟4-多维表.png` |
| 5 | 关窗 | 窗口关闭后 CDP 随进程销毁 | 脚本断言 |

## 说明

- 安装目录沿用历史 InstallLocation（scoop 目录）属 NSIS 升级语义；包本身是 NSIS currentUser 安装器，`.sig` 用于 updater。
- W111–W114 / W130 因公开链接策略未定仍 BLOCKED，与本任务无关。

## 命令

```bash
cd app
npm run build
npm run tauri:build     # 需 PATH=cargo + 代理 7897 + TAURI_SIGNING_PRIVATE_KEY
npm run install-app     # 静默安装
npm run installed-w132-smoke
```
