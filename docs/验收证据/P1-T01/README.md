# P1-T01 三端空壳工程（2026-11-07，已验收）

> 验收人：用户本人。结论：**三入口均打开成功，看到同一个空白首页，回「通过」**。

## 交付物

- 客户端工程：`client/`（Flutter 3.47.9，包名 `com.lightledger.bijiapp`，平台 android/windows/web）
- 三端统一首页：书本图标 + 「个人知识库」+ 「P1-T01 三端空壳 · 骨架已就绪」（`client/lib/main.dart`）

## 三端验证记录

| 入口 | 方式 | 结果 |
| --- | --- | --- |
| 安卓 | release APK（41.2MB）装模拟器 test1，monkey 启动 | ✅ 首页正常（截图 `安卓模拟器-空壳首页.png`） |
| Web | `flutter build web --release` + 本地静态服务（验收时 5176 端口，验收后已停） | ✅ HTTP 200，首页正常；字体/引擎已本地化（复用 P0-T02 修复，`web/fonts.gstatic/` 37 个 woff2 + 自定义 bootstrap） |
| Windows | `flutter build windows --release`（51.2s）→ `build/windows/x64/runner/Release/bijiapp.exe` | ✅ 桌面窗口弹出，首页正常（用户当面确认） |

## 本包新增环境

- **Visual Studio Build Tools 2022**（Windows 端构建依赖，用户在 T08-B 口径预批准）：
  - 安装路径 `E:\dev\vs2022\BuildTools`（C 盘仅共享组件约 1GB，如实报备）
  - MSVC 14.44.35207 + Windows SDK（--includeRecommended）
  - 静默安装 `--quiet --wait --norestart --nocache`，退出码 0，vswhere 验证通过

## 已知边界（不影响验收）

- Windows 窗口为默认尺寸/无视觉打磨（空壳阶段口径）
- 网页端首次加载 2-4 秒（本地引擎初始化）
- `client/` 尚未接任何数据库——数据层从 P1-T02 开始
