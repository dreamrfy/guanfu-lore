# A02 验收证据 · 工程骨架+登录/设置页

日期：2026-11-15 ｜ 执行：看门狗 v6（A02 会话）｜ APK：android-shell/app/build/outputs/apk/debug/app-debug.apk（17:59 版，11.5MB）

## 证据清单

- `emulator-alive-1931.png` — 主会话 19:31 模拟器存活证据（emulator-5554 恢复）
- `02-MainActivity-主界面.png` — 安装后启动：MainActivity 正常渲染（「设置」按钮+就绪文案），topResumedActivity=MainActivity，无 FATAL
- `03-SettingsCompose页.png` — Compose 设置页完整渲染：服务地址/Token 输入框（留空即用内置默认占位）、加密存储说明、测试连接/保存按钮、底部信息卡
- `04-BUG崩溃现场-回退主界面.png` — **首轮冒烟逮到真 bug 的现场**：点「测试连接」→ NetworkOnMainThreadException → app 闪退回主界面（logcat FATAL EXCEPTION: main, android.os.NetworkOnMainThreadException at java.net.InetAddress…）

## 冒烟流程记录

1. adb install -r -t app-debug.apk → **Success**（emulator-5554，Android 14 / API 34）
2. am start MainActivity → topResumedActivity=…MainActivity，logcat 无 FATAL
3. UI dump 定位「设置」按钮 bounds [48,1070][1032,1196] → input tap → topResumedActivity=…SettingsComposeActivity（Compose 首帧渲染成功，截图 03）
4. 点「测试连接」→ FATAL: NetworkOnMainThreadException（截图 04）→ **bug 修复**：SettingsScreen 的 scope.launch 改 Dispatchers.IO + withContext(Main) 回写 UI
5. 修复后重建遇主机 commit 内存枯竭（qemu 4.3GB + vite 残留 2.4GB 占满），复验挂起（见执行报告）

## JVM 单测

testDebugUnitTest：**23/23 全绿**（4 件 shell 既有测试 + 新增 CredentialsTest 3 例：空值回落语义、token 优先级、deviceId 格式）

## 修复版复验（2026-11-15 21:03–21:26，看门狗续跑）

- **构建**：assembleDebug 成功（30s，21:03:29 落盘 11.5MB，含 Dispatchers.IO 修复）
- **修复验证（失败路径）**：模拟器（无外网环境）点「测试连接」→ 不再崩溃，UI 显示「✘ 连接失败：请求超时」——`05-修复后-测试连接点击.png`、`06-修复后-测试连接结果.png`。根因不是 app：模拟器 ping 8.8.8.8 100% 丢包（无外网出口），主机直连 clip.guanfu.app 也不通需代理
- **真实成功路径**：为拿到非降级证据，搭了纯基础设施验证姿势（零 app 代码改动）：
  1. 模拟器带 `-writable-system` 重启 → root+remount → `/etc/hosts` 写入 `10.0.2.2 clip.guanfu.app`
  2. SSH 本地隧道 `主机127.0.0.1:443 → VPS → clip.guanfu.app:443`（10.0.2.2 即主机回环，SNI/TLS 全按真域名走）
  3. app 地址/Token 留空（内置默认）→ 点「测试连接」→ **「✔ 连接正常（鉴权通过）」**——真云鉴权成功，无 FATAL
  - 证据：`07-修复后-测试连接成功.png`（logcat 无 app FATAL；报错均为 Google Play services 进程自身 flag 同步超时，与本 app 无关）
- **NetworkOnMainThreadException 复发排查**：logcat 无该异常（19:41 的 FATAL 是修复前旧崩溃残留，`logcat -c` 后复测干净）

## 遗留

- 无（修复版复验完成，A03 可直接开工）
