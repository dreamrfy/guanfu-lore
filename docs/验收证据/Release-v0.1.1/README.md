# Release v0.1.1 发布证据

- 日期：2026-11-22
- Release：https://github.com/dreamrfy/guanfu-lore/releases/tag/v0.1.1（id 454189868）
- 标签：`v0.1.1` 已推 github + gitee；分支 `feat/v3.3-web-app` 提交 `3e22601`

## 产物

| 文件 | 大小 | sha256（前16位） |
| --- | --- | --- |
| `guanfu-lore_0.1.1_x64-setup.exe` | 3,694,041 | `ef642e0aa828a4af` |
| `guanfu-lore_0.1.1_x64-setup.exe.sig` | 440 | —（签名对应私钥 `E:/credentials/tauri-updater/bijiapp.key`） |
| `latest.json` | 894 | —（内嵌签名，updater 端点用） |

三个资产均经 GitHub API 上传成功（`state: uploaded`）。

## 版本同步

- `tauri.conf.json` / `Cargo.toml`：0.1.0 → 0.1.1
- `scoop/guanfu-lore.json`：version/url/hash 同步（hash = 上表 sha256）
- `ops/latest.json`：重签名组装，`pub_date` 2026-11-22T03:58Z

## 验证状态（诚实记录）

| 环节 | 结果 |
| --- | --- |
| Release 创建 + 资产上传 | ✅ API 确认 |
| latest.json 端点（releases/latest/download） | ✅ 资产已上传（bytes 与本地一致 894） |
| 下载对账（latest.json → exe → sha256） | ⚠️ **本机网络不可达**：github.com / 下载 CDN 直连与代理均超时（D03 时同因「NSIS 下载被 CDN 不可达挡住」）。发布本身成功；网络恢复后在正常网络环境打开 Release 页即可下载，updater 链路待装机复验 |

## 命令

```bash
cd app
npm run build
# PATH=cargo + 代理 7897 + TAURI_SIGNING_PRIVATE_KEY 三件套
npm run tauri:build
```
