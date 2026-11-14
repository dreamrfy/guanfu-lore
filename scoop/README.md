# Scoop 分发（决策 D3）

为什么走 Scoop 而不是代码签名证书：

- **Scoop 下载的文件不带「来自互联网」标记（Mark-of-the-Web）**，所以 SmartScreen 一般不会拦，
  用户不用点「更多信息 → 仍要运行」；
- 买 OV 代码签名证书约 $10/月起，而且**微软 2023 年起 EV 证书不再自动获得 SmartScreen 信誉**，
  新证书照样可能弹窗——花钱≠一定不弹；
- Scoop 免费、零维护，还能一条命令升级（`scoop update bijiapp`）。

## 清单文件

- `bijiapp.json` —— Scoop 的 bucket 清单（一个 bucket = 一个 Git 仓库里的若干 json）。
  目前 `OWNER` / `hash` 是占位符，**第一次发版后必须替换**。

## 发版流程（第一次）

1. 在 `app/` 里构建安装包（NSIS 安装器）：

   ```bash
   cd app
   npm run tauri:build          # 产出 src-tauri/target/release/bundle/nsis/*.exe
   ```

2. 算 sha256 并填进清单：

   ```bash
   sha256sum src-tauri/target/release/bundle/nsis/*.exe
   ```

3. 把 exe 传到 GitHub Release，文件名与清单里的 `url` 对齐：

   ```
   https://github.com/OWNER/bijiapp/releases/download/v0.1.0/bijiapp_0.1.0_x64-setup.exe
   ```

4. 把清单里的 `OWNER` 换成真实仓库、`hash` 换成上一步的 sha256，提交这个 bucket 仓库。

## 用户怎么装

```bash
scoop bucket add bijiapp https://github.com/OWNER/bijiapp-scoop
scoop install bijiapp
```

## 备选：Microsoft Store（MSIX）

如果以后要面向大众，Store 版本由微软签名、不会弹窗，还能自动更新。
代价是 Partner Center 开发者账号（约 $19 一次性）+ 每次更新都要审核。
Store 版与 Scoop 版可以并存（Scoop 版给懂技术的人，Store 版给普通用户）。
