# D02 · Scoop 清单收尾 · 验收证据

- 日期：2026-11-15 16:30-16:45
- 执行：看门狗 v6（本会话）

## 结论：DONE

1. **Scoop 已装**：v0.6.0（C:/Users/12589/scoop），main bucket 1714 manifests —— 任务第一步「自动安装」满足，无需再装。
2. **sha256 现算填入**：安装包 app/src-tauri/target/release/bundle/nsis/guanfu-lore_0.1.0_x64-setup.exe
   → 0f11b1dcdffd7294a3e5a50be6fc49d5d669b837696cc249da5335db2e5fd189（manifest 主 hash + autoupdate hash 两处）。
3. **本地 file:// 验证安装（全链路真实跑通）**：
   - 本地 bucket：C:/Users/12589/scoop-buckets/guanfu-local（repo 外独立 git，验证专用；正式 manifest 仍指向 GitHub Releases 占位符，等 D03 建仓后换真 URL）。
   - WARN  'guanfu-lore' (0.1.0) is already installed.
Use 'scoop update guanfu-lore' to install a new version.：下载 file:// 安装包 → **Checking hash ... OK** → **Running installer ... Done**（NSIS 静默 /S /D=\）→ Linking → **Creating shortcut 观复 · Lore (guanfu-lore.exe)** → installed successfully。
   - 产物：scoop/apps/guanfu-lore/current/guanfu-lore.exe + uninstall.exe；开始菜单快捷方式「观复 · Lore.lnk」生成。
   - 冒烟：快捷方式目标启动 guanfu-lore.exe，进程 Responding=True，停止正常。
   - 卸载验证：scoop uninstall 干净移除（apps 目录无残留）。
4. **验证过程中发现并修掉两个 manifest 真缺陷**（file:// 验证的价值所在）：
   - 缺 installer.args → Scoop 只复制 setup.exe 不执行安装，装出来是空壳还报 success；
   - shortcuts 用对象写法 → Scoop 0.6.0 只认 [target, name, icon] 数组写法，报 item() 方法错误。
   - 修复后本机真实重装通过（证据 install-log-success.txt）。

## 遗留
- manifest 的 url/checkver/autoupdate 仍是 github.com/OWNER/REPO 占位符 —— 归 D03 建开源仓后填真地址。
- Scoop 装出来的 NSIS per-user 安装无升级器联动问题：NSIS /D 不带引号路径有空格会挂 —— 本机路径 C:/Users/12589 无空格，通过；将来若用户名含空格需在 NSIS 端复核（低风险，记录在案）。
