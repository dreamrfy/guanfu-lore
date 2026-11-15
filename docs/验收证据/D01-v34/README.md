# D01-v34 安装包本机装/卸实测证据（2026-11-15 · 看门狗 v6）

## 结论

**通过**。2026-11-15 出的 NSIS 包（`app/src-tauri/target/release/bundle/nsis/guanfu-lore_0.1.0_x64-setup.exe`）本机静默安装 → 启动冒烟 → 静默卸载 → 残留检查全链路 OK。

## 实测记录（16:25~16:42）

| 步骤 | 结果 |
| --- | --- |
| 静默安装 `/S` | ✅ per-user 装到 `C:\Users\12589\AppData\Local\guanfu-lore\`（guanfu-lore.exe + uninstall.exe）；注册表 Uninstall 键 DisplayName=guanfu-lore、DisplayVersion=0.1.0、InstallLocation 指向该目录 |
| 启动 | ✅ 进程 guanfu-lore PID 36908；MainWindowTitle「观复 · Lore」；主界面（侧栏/页面列表/编辑器/页面信息面板/AI 供应商设置）渲染正常，见 `01-启动主窗口.png` |
| 应用数据 | ✅ `AppData\Local\app.guanfu.desktop\EBWebView\` 随首启生成（WebView2 用户数据） |
| 更新器静默检查 | ⚠️ endpoint 是占位符 `https://github.com/OWNER/REPO/releases/latest/download/latest.json`（等 D03 建开源仓后替换）；当前不产生有效更新检查、不影响应用运行——**全链路验证归 D03** |
| 静默卸载 `/S` | ✅ 卸载完成 |
| 残留检查 | ✅ 安装目录已删；注册表 Uninstall 键 0 条；进程 0；桌面/开始菜单无快捷方式 |

## 残留说明（预期行为，非缺陷）

`AppData\Local\app.guanfu.desktop\`（13MB，WebView2 用户数据 EBWebView）在卸载后保留——Tauri NSIS 默认卸载器**保留用户数据**（重装后登录状态/设置不丢）。如需纯净卸载可在 D03 后续给 NSIS 脚本加删除指令，现阶段不处理。

## 更新器全链路

仍等 D03（建开源仓 + Releases + latest.json + 签名公钥替换 endpoint），本任务范围外。
